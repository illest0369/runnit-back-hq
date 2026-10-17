from __future__ import annotations

import runpy
import subprocess
from pathlib import Path
from unittest.mock import Mock, patch

import pytest

from rbhq_runpod.handler import (
    RenderRequest,
    build_ffmpeg_command,
    create_caption_image,
    download_source,
    preferred_encoder,
    probe_media,
    process_job,
    render_vertical_clip,
    upload_file,
    validate_input,
)


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


@pytest.mark.parametrize(
    ("field", "value", "message"),
    [
        ("source_url", "", "source_url is required"),
        ("public_url", 123, "public_url is required"),
        ("start_seconds", "two", "start_seconds must be a number"),
        ("caption_text", 123, "caption_text must be a string"),
        ("caption_text", "x" * 501, "caption_text cannot exceed 500 characters"),
    ],
)
def test_validate_input_rejects_wrong_types_and_bounds(field: str, value: object, message: str) -> None:
    payload = valid_input()
    payload[field] = value

    with pytest.raises(ValueError, match=message):
        validate_input(payload)


def test_validate_input_requires_an_object() -> None:
    with pytest.raises(ValueError, match="job input must be an object"):
        validate_input(None)  # type: ignore[arg-type]


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


def test_build_ffmpeg_command_supports_cpu_without_a_caption(tmp_path: Path) -> None:
    request = RenderRequest(**{**valid_input(), "caption_text": ""})
    command = build_ffmpeg_command(
        request=request,
        source_path=tmp_path / "source.mp4",
        output_path=tmp_path / "output.mp4",
        caption_path=None,
        encoder="libx264",
    )

    assert "-vf" in command
    assert "libx264" in command
    assert "-crf" in command


@patch("rbhq_runpod.handler._run")
def test_download_source_accepts_only_the_reported_workspace_file(run_command: Mock, tmp_path: Path) -> None:
    source_path = tmp_path / "source.mp4"
    source_path.write_bytes(b"video")
    run_command.return_value = subprocess.CompletedProcess([], 0, stdout=f"{source_path}\n", stderr="")

    result = download_source(RenderRequest(**valid_input()), tmp_path)

    assert result == source_path
    assert run_command.call_args.args[0][0] == "yt-dlp"


@patch("rbhq_runpod.handler._run")
def test_download_source_rejects_a_path_outside_the_workspace(run_command: Mock, tmp_path: Path) -> None:
    foreign_path = tmp_path.parent / "foreign.mp4"
    foreign_path.write_bytes(b"video")
    run_command.return_value = subprocess.CompletedProcess([], 0, stdout=f"{foreign_path}\n", stderr="")

    with pytest.raises(RuntimeError, match="job workspace"):
        download_source(RenderRequest(**valid_input()), tmp_path)

    foreign_path.unlink()


def test_create_caption_image_writes_a_png(tmp_path: Path) -> None:
    output_path = tmp_path / "caption.png"

    create_caption_image("A long caption that wraps safely over more than one line", output_path)

    assert output_path.read_bytes().startswith(b"\x89PNG")


@pytest.mark.parametrize(
    ("encoders", "expected"),
    [("V..... h264_nvenc NVIDIA NVENC", "h264_nvenc"), ("V..... libx264 H.264", "libx264")],
)
@patch("rbhq_runpod.handler.subprocess.run")
def test_preferred_encoder_detects_gpu_support(
    run_command: Mock,
    encoders: str,
    expected: str,
) -> None:
    run_command.return_value = subprocess.CompletedProcess([], 0, stdout=encoders, stderr="")

    assert preferred_encoder() == expected


@patch("rbhq_runpod.handler._run")
@patch("rbhq_runpod.handler.preferred_encoder", return_value="h264_nvenc")
@patch("rbhq_runpod.handler.create_caption_image")
def test_render_vertical_clip_creates_a_nonempty_output(
    create_caption: Mock,
    _encoder: Mock,
    run_command: Mock,
    tmp_path: Path,
) -> None:
    def fake_run(command: list[str]) -> subprocess.CompletedProcess[str]:
        Path(command[-1]).write_bytes(b"rendered")
        return subprocess.CompletedProcess(command, 0, stdout="", stderr="")

    create_caption.side_effect = lambda _caption, path: path.write_bytes(b"png")
    run_command.side_effect = fake_run
    request = RenderRequest(**valid_input())

    render_vertical_clip(request, tmp_path / "source.mp4", tmp_path / "output.mp4", tmp_path)

    create_caption.assert_called_once()
    assert "h264_nvenc" in run_command.call_args.args[0]


@patch("rbhq_runpod.handler._run")
@patch("rbhq_runpod.handler.preferred_encoder", return_value="libx264")
def test_render_vertical_clip_rejects_an_empty_result(
    _encoder: Mock,
    _run_command: Mock,
    tmp_path: Path,
) -> None:
    request = RenderRequest(**{**valid_input(), "caption_text": ""})

    with pytest.raises(RuntimeError, match="non-empty MP4"):
        render_vertical_clip(request, tmp_path / "source.mp4", tmp_path / "output.mp4", tmp_path)


@patch("requests.put")
def test_upload_file_streams_the_mp4_and_checks_the_response(put: Mock, tmp_path: Path) -> None:
    output_path = tmp_path / "output.mp4"
    output_path.write_bytes(b"rendered")
    response = Mock()
    put.return_value = response

    upload_file(output_path, valid_input()["upload_url"])  # type: ignore[arg-type]

    response.raise_for_status.assert_called_once_with()
    assert put.call_args.kwargs["headers"] == {"content-type": "video/mp4"}


@patch("rbhq_runpod.handler._run")
def test_probe_media_returns_normalized_metrics(run_command: Mock, tmp_path: Path) -> None:
    run_command.return_value = subprocess.CompletedProcess(
        [],
        0,
        stdout='{"streams":[{"width":1080,"height":1920}],"format":{"duration":"10.25"}}',
        stderr="",
    )

    assert probe_media(tmp_path / "output.mp4") == {
        "duration_seconds": 10.25,
        "width": 1080,
        "height": 1920,
    }


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
    uploaded_bytes: list[bytes] = []

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
    upload_file.side_effect = lambda output_path, _upload_url: uploaded_bytes.append(output_path.read_bytes())
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
    assert uploaded_bytes == [b"rendered-video"]
    assert all(not path.exists() for path in temporary_paths)


def test_process_job_requires_runpod_job_shape() -> None:
    with pytest.raises(ValueError, match="job input is required"):
        process_job({"id": "runpod-job-1"})


@patch("runpod.serverless.start")
def test_conventional_entrypoint_starts_the_worker(start: Mock) -> None:
    entrypoint = Path(__file__).parents[1] / "handler.py"

    runpy.run_path(str(entrypoint), run_name="__main__")

    start.assert_called_once_with({"handler": process_job})
