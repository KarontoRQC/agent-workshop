import os
import shutil
import subprocess
import sys
import tempfile

from config import get_tts_settings


class TtsConfigurationError(RuntimeError):
    pass


class TtsSynthesisError(RuntimeError):
    pass


def synthesize_speech(text, mood="neutral"):
    settings = get_tts_settings()
    provider = settings.provider

    if provider in {"auto", "browser", "edge"}:
        return synthesize_with_edge_tts(text, mood, settings), "audio/mpeg"

    if provider != "piper":
        raise TtsConfigurationError("Unsupported TTS_PROVIDER. Use edge, piper, auto, or browser.")

    return synthesize_with_piper(text, mood, settings), "audio/wav"


def synthesize_with_edge_tts(text, mood, settings):
    edge_exe = settings.edge_tts_exe or "edge-tts"
    edge_command = get_edge_command(edge_exe)

    with tempfile.NamedTemporaryFile(delete=False, suffix=".mp3") as output_file:
        output_path = output_file.name

    try:
        command = [
            *edge_command,
            "--voice",
            settings.edge_tts_voice,
            "--text",
            text,
            "--write-media",
            output_path,
            f"--rate={get_edge_mood_rate(mood, settings.edge_tts_rate)}",
            f"--volume={settings.edge_tts_volume}",
            f"--pitch={get_edge_mood_pitch(mood, settings.edge_tts_pitch)}",
        ]

        result = subprocess.run(
            command,
            capture_output=True,
            encoding="utf-8",
            errors="replace",
            timeout=settings.edge_tts_timeout,
            check=False,
        )

        if result.returncode != 0:
            detail = (result.stderr or result.stdout or "").strip()
            raise TtsSynthesisError(detail or f"edge-tts exited with code {result.returncode}.")

        with open(output_path, "rb") as audio_file:
            audio = audio_file.read()

        if not audio:
            raise TtsSynthesisError("edge-tts produced an empty audio file.")

        return audio
    except subprocess.TimeoutExpired as exc:
        raise TtsSynthesisError("edge-tts synthesis timed out.") from exc
    finally:
        try:
            os.remove(output_path)
        except OSError:
            pass


def get_edge_command(edge_exe):
    if not edge_exe or edge_exe == "edge-tts":
        return [sys.executable, "-m", "edge_tts"]

    if os.path.sep in edge_exe or (os.path.altsep and os.path.altsep in edge_exe):
        if not os.path.exists(edge_exe):
            raise TtsConfigurationError(f"edge-tts executable was not found: {edge_exe}")

        return [edge_exe]

    resolved = shutil.which(edge_exe)
    if resolved:
        return [resolved]

    return [sys.executable, "-m", "edge_tts"]


def synthesize_with_piper(text, mood, settings):
    if not settings.piper_exe:
        raise TtsConfigurationError("PIPER_EXE is required when TTS_PROVIDER=piper.")

    if not settings.piper_voice:
        raise TtsConfigurationError("PIPER_VOICE is required when TTS_PROVIDER=piper.")

    if not os.path.exists(settings.piper_exe):
        raise TtsConfigurationError(f"Piper executable was not found: {settings.piper_exe}")

    if not os.path.exists(settings.piper_voice):
        raise TtsConfigurationError(f"Piper voice model was not found: {settings.piper_voice}")

    with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as output_file:
        output_path = output_file.name

    try:
        command = [
            settings.piper_exe,
            "--model",
            settings.piper_voice,
            "--output_file",
            output_path,
            "--length_scale",
            str(get_mood_length_scale(mood, settings.piper_length_scale)),
            "--noise_scale",
            str(settings.piper_noise_scale),
            "--noise_w",
            str(settings.piper_noise_w),
        ]

        if settings.piper_config:
            command.extend(["--config", settings.piper_config])

        result = subprocess.run(
            command,
            input=text,
            capture_output=True,
            encoding="utf-8",
            errors="replace",
            timeout=settings.piper_timeout,
            check=False,
        )

        if result.returncode != 0:
            detail = (result.stderr or result.stdout or "").strip()
            raise TtsSynthesisError(detail or f"Piper exited with code {result.returncode}.")

        with open(output_path, "rb") as audio_file:
            audio = audio_file.read()

        if not audio:
            raise TtsSynthesisError("Piper produced an empty audio file.")

        return audio
    except subprocess.TimeoutExpired as exc:
        raise TtsSynthesisError("Piper synthesis timed out.") from exc
    finally:
        try:
            os.remove(output_path)
        except OSError:
            pass


def get_mood_length_scale(mood, base_length_scale):
    mood_scale = {
        "explaining": 1.08,
        "neutral": 1.0,
        "recommending": 0.94,
        "summary": 1.04,
        "warm": 1.1,
    }.get(mood, 1.0)

    return max(0.65, min(1.45, base_length_scale * mood_scale))


def get_edge_mood_rate(mood, base_rate):
    if base_rate != "+0%":
        return base_rate

    return {
        "explaining": "-6%",
        "neutral": "-2%",
        "recommending": "+0%",
        "summary": "-4%",
        "warm": "-8%",
    }.get(mood, base_rate)


def get_edge_mood_pitch(mood, base_pitch):
    if base_pitch != "+0Hz":
        return base_pitch

    return {
        "explaining": "-2Hz",
        "neutral": "+0Hz",
        "recommending": "+4Hz",
        "summary": "-4Hz",
        "warm": "-2Hz",
    }.get(mood, base_pitch)
