from __future__ import annotations

from pathlib import Path
from unittest.mock import Mock, patch

import pytest

from rbhq_runpod.handler import RenderRequest, build_ffmpeg_command, process_job, validate_input


def valid_input() -> dict[str, object]:
    return {
        "source_url": "https://media.example.com/source.mp4",
        "upload_url": "https://account.r2.cloudflarestorage.com/bucket/output.mp4?X-Amz-Signature=test",
        "public_url": "https://pub-example.r2.dev/channel/generated-clips/output.mp4",
        "start_seconds": 2.5,
        "end_seconds": 12.5,
        "caption_text": "Fourth-quarter comeback",
    }


def test_validate_input_accepts_a_scoped_render_request() -> None:
    request = validate_input(valid_input())

    assert request.source_url == "https://media.example.com/source.mp4"
    assert request.duration_seconds == 10
    assert request.caption_text == "Fourth-quarter comeback"


@pytest.mark.parametrize(
    ("field", "value", "message"),
    [
        ("source_url", "http://media.example.com/source.mp4", "source_url must use HTTPS"),
        ("source_url", "https://127.0.0.1/source.mp4", "source_url must target a public host"),
        ("upload_url", "https://uploads.example.com/output.mp4", "upload_url must target Cloudflare R2"),
        ("start_seconds", -1, "start_seconds must be non-negative"),
        ("end_seconds", 2.9, "render duration must be at least 1 second"),
        ("end_seconds", 70, "render duration cannot exceed 60 seconds"),
    ],
)
def test_validate_input_rejects_unsafe_or_invalid_values(
    field: str,
    value: object,
    message: str,
) -> None:
    payload = valid_input()
    payload[field] = value

    with pytest.raises(ValueError, match=message):
        validate_input(payload)


def test_build_ffmpeg_command_uses_gpu_encoding_and_keeps_caption_as_a_file(tmp_path: Path) -> None:
    request = RenderRequest(**valid_input())
    source_path = tmp_path / "source.mp4"
    output_path = tmp_path / "output.mp4"
    caption_path = tmp_path / "caption.png"

    command = build_ffmpeg_command(
        request=request,
        source_path=source_path,
        output_path=output_path,
        caption_path=caption_path,
        encoder="h264_nvenc",
    )

    assert command[0] == "ffmpeg"
    assert "h264_nvenc" in command
    assert str(caption_path) in command
    assert request.caption_text not in command
    assert command[-1] == str(output_path)


@patch("rbhq_runpod.handler.probe_media")
@patch("rbhq_runpod.handler.upload_file")
@patch("rbhq_runpod.handler.render_vertical_clip")
@patch("rbhq_runpod.handler.download_source")
def test_process_job_renders_uploads_and_removes_temporary_files(
    download_source: Mock,
    render_vertical_clip: Mock,
    upload_file: Mock,
    probe_media: Mock,
) -> None:
    temporary_paths: list[Path] = []

    def fake_download(request: RenderRequest, work_dir: Path) -> Path:
        temporary_paths.append(work_dir)
        source_path = work_dir / "source.mp4"
        source_path.write_bytes(b"source")
        return source_path

    def fake_render(
        request: RenderRequest,
        source_path: Path,
        output_path: Path,
        work_dir: Path,
    ) -> None:
        assert source_path.read_bytes() == b"source"
        assert work_dir == source_path.parent
        output_path.write_bytes(b"rendered-video")

    download_source.side_effect = fake_download
    render_vertical_clip.side_effect = fake_render
    probe_media.return_value = {"duration_seconds": 10.0, "width": 1080, "height": 1920}

    result = process_job({"id": "runpod-job-1", "input": valid_input()})

    assert result == {
        "status": "rendered",
        "public_url": "https://pub-example.r2.dev/channel/generated-clips/output.mp4",
        "duration_seconds": 10.0,
        "width": 1080,
        "height": 1920,
        "size_bytes": 14,
    }
    upload_file.assert_called_once()
    assert upload_file.call_args.args[0].read_bytes() == b"rendered-video"
    assert all(not path.exists() for path in temporary_paths)


def test_process_job_requires_runpod_job_shape() -> None:
    with pytest.raises(ValueError, match="job input is required"):
        process_job({"id": "runpod-job-1"})
