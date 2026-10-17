from __future__ import annotations

import ipaddress
import json
import subprocess
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from urllib.parse import urlparse


@dataclass(frozen=True)
class RenderRequest:
    """Validated input for one vertical clip render."""

    source_url: str
    upload_url: str
    public_url: str
    start_seconds: float
    end_seconds: float
    caption_text: str = ""

    @property
    def duration_seconds(self) -> float:
        return self.end_seconds - self.start_seconds


def _required_string(payload: dict[str, Any], name: str) -> str:
    value = payload.get(name)
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{name} is required")
    return value.strip()


def _number(payload: dict[str, Any], name: str) -> float:
    value = payload.get(name)
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError(f"{name} must be a number")
    return float(value)


def _validate_public_https_url(value: str, name: str) -> None:
    parsed = urlparse(value)
    if parsed.scheme != "https":
        raise ValueError(f"{name} must use HTTPS")
    if not parsed.hostname:
        raise ValueError(f"{name} must include a host")

    hostname = parsed.hostname.lower()
    if hostname == "localhost" or hostname.endswith(".local"):
        raise ValueError(f"{name} must target a public host")

    try:
        address = ipaddress.ip_address(hostname)
    except ValueError:
        return
    if not address.is_global:
        raise ValueError(f"{name} must target a public host")


def validate_input(payload: dict[str, Any]) -> RenderRequest:
    """Validate job data before any network or process side effects."""

    if not isinstance(payload, dict):
        raise ValueError("job input must be an object")

    source_url = _required_string(payload, "source_url")
    upload_url = _required_string(payload, "upload_url")
    public_url = _required_string(payload, "public_url")
    start_seconds = _number(payload, "start_seconds")
    end_seconds = _number(payload, "end_seconds")
    caption_value = payload.get("caption_text", "")
    if not isinstance(caption_value, str):
        raise ValueError("caption_text must be a string")
    caption_text = caption_value.strip()

    _validate_public_https_url(source_url, "source_url")
    _validate_public_https_url(upload_url, "upload_url")
    _validate_public_https_url(public_url, "public_url")
    upload_host = urlparse(upload_url).hostname or ""
    if not upload_host.endswith(".r2.cloudflarestorage.com"):
        raise ValueError("upload_url must target Cloudflare R2")
    if start_seconds < 0:
        raise ValueError("start_seconds must be non-negative")

    duration_seconds = end_seconds - start_seconds
    if duration_seconds < 1:
        raise ValueError("render duration must be at least 1 second")
    if duration_seconds > 60:
        raise ValueError("render duration cannot exceed 60 seconds")
    if len(caption_text) > 500:
        raise ValueError("caption_text cannot exceed 500 characters")

    return RenderRequest(
        source_url=source_url,
        upload_url=upload_url,
        public_url=public_url,
        start_seconds=start_seconds,
        end_seconds=end_seconds,
        caption_text=caption_text,
    )


def _run(command: list[str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(command, check=True, capture_output=True, text=True)


def download_source(request: RenderRequest, work_dir: Path) -> Path:
    """Download a single public source video with yt-dlp."""

    output_template = work_dir / "source.%(ext)s"
    completed = _run(
        [
            "yt-dlp",
            "--no-playlist",
            "--no-update",
            "--merge-output-format",
            "mp4",
            "--print",
            "after_move:filepath",
            "-f",
            "bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]/best",
            "-o",
            str(output_template),
            request.source_url,
        ]
    )
    output_line = next((line.strip() for line in reversed(completed.stdout.splitlines()) if line.strip()), "")
    source_path = Path(output_line).resolve()
    if work_dir.resolve() not in source_path.parents or not source_path.is_file():
        raise RuntimeError("yt-dlp did not produce a source file in the job workspace")
    return source_path


def create_caption_image(caption_text: str, output_path: Path) -> None:
    """Create a bounded caption overlay without passing user text to ffmpeg."""

    from PIL import Image, ImageDraw, ImageFont

    words = caption_text.split()
    lines: list[str] = []
    current = ""
    for word in words:
        candidate = f"{current} {word}".strip()
        if current and len(candidate) > 28:
            lines.append(current)
            current = word
        else:
            current = candidate
    if current:
        lines.append(current)
    lines = lines[:4]

    width = 960
    line_height = 70
    padding_y = 34
    height = max(130, len(lines) * line_height + padding_y * 2)
    image = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle((0, 0, width - 1, height - 1), radius=30, fill=(0, 0, 0, 158))
    font_path = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
    try:
        font = ImageFont.truetype(font_path, 54)
    except OSError:
        font = ImageFont.load_default()

    for index, line in enumerate(lines):
        box = draw.textbbox((0, 0), line, font=font)
        text_width = box[2] - box[0]
        draw.text(((width - text_width) / 2, padding_y + index * line_height), line, font=font, fill="white")
    image.save(output_path, "PNG")


def preferred_encoder() -> str:
    """Use NVIDIA encoding when the assigned worker exposes it."""

    completed = subprocess.run(
        ["ffmpeg", "-hide_banner", "-encoders"],
        check=False,
        capture_output=True,
        text=True,
    )
    return "h264_nvenc" if "h264_nvenc" in completed.stdout else "libx264"


def build_ffmpeg_command(
    *,
    request: RenderRequest,
    source_path: Path,
    output_path: Path,
    caption_path: Path | None,
    encoder: str,
) -> list[str]:
    """Build an argument-only ffmpeg command with no shell interpolation."""

    video_filter = "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,format=yuv420p"
    command = [
        "ffmpeg",
        "-hide_banner",
        "-loglevel",
        "warning",
        "-y",
        "-ss",
        f"{request.start_seconds:.3f}",
        "-i",
        str(source_path),
        "-t",
        f"{request.duration_seconds:.3f}",
    ]
    if caption_path is not None:
        command.extend(
            [
                "-i",
                str(caption_path),
                "-filter_complex",
                f"[0:v]{video_filter}[base];[base][1:v]overlay=(W-w)/2:H-h-170[v]",
                "-map",
                "[v]",
                "-map",
                "0:a?",
            ]
        )
    else:
        command.extend(["-vf", video_filter, "-map", "0:v:0", "-map", "0:a?"])

    command.extend(["-c:v", encoder])
    if encoder == "h264_nvenc":
        command.extend(["-preset", "p4", "-cq", "23"])
    else:
        command.extend(["-preset", "veryfast", "-crf", "23"])
    command.extend(
        [
            "-c:a",
            "aac",
            "-b:a",
            "128k",
            "-movflags",
            "+faststart",
            str(output_path),
        ]
    )
    return command


def render_vertical_clip(
    request: RenderRequest,
    source_path: Path,
    output_path: Path,
    work_dir: Path,
) -> None:
    caption_path: Path | None = None
    if request.caption_text:
        caption_path = work_dir / "caption.png"
        create_caption_image(request.caption_text, caption_path)

    _run(
        build_ffmpeg_command(
            request=request,
            source_path=source_path,
            output_path=output_path,
            caption_path=caption_path,
            encoder=preferred_encoder(),
        )
    )
    if not output_path.is_file() or output_path.stat().st_size <= 0:
        raise RuntimeError("ffmpeg did not produce a non-empty MP4")


def upload_file(output_path: Path, upload_url: str) -> None:
    """Upload the rendered MP4 to the short-lived presigned R2 URL."""

    import requests

    with output_path.open("rb") as source:
        response = requests.put(
            upload_url,
            data=source,
            headers={"content-type": "video/mp4"},
            timeout=(15, 300),
        )
    response.raise_for_status()


def probe_media(output_path: Path) -> dict[str, int | float]:
    completed = _run(
        [
            "ffprobe",
            "-v",
            "error",
            "-show_entries",
            "stream=width,height",
            "-show_entries",
            "format=duration",
            "-of",
            "json",
            str(output_path),
        ]
    )
    payload = json.loads(completed.stdout)
    stream = next(
        (entry for entry in payload.get("streams", []) if entry.get("width") and entry.get("height")),
        {},
    )
    return {
        "duration_seconds": float(payload.get("format", {}).get("duration", 0)),
        "width": int(stream.get("width", 0)),
        "height": int(stream.get("height", 0)),
    }


def process_job(job: dict[str, Any]) -> dict[str, Any]:
    """Render one clip and return only non-secret output metadata."""

    payload = job.get("input") if isinstance(job, dict) else None
    if not isinstance(payload, dict):
        raise ValueError("job input is required")
    request = validate_input(payload)

    with tempfile.TemporaryDirectory(prefix="rbhq-runpod-") as temporary_dir:
        work_dir = Path(temporary_dir)
        source_path = download_source(request, work_dir)
        output_path = work_dir / "output.mp4"
        render_vertical_clip(request, source_path, output_path, work_dir)
        size_bytes = output_path.stat().st_size
        media = probe_media(output_path)
        upload_file(output_path, request.upload_url)
        return {
            "status": "rendered",
            "public_url": request.public_url,
            "duration_seconds": media["duration_seconds"],
            "width": media["width"],
            "height": media["height"],
            "size_bytes": size_bytes,
        }


def main() -> None:
    import runpod

    runpod.serverless.start({"handler": process_job})


if __name__ == "__main__":
    main()
