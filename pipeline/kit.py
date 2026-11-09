"""Shared paths and helpers for the video-kit pipeline."""
from __future__ import annotations

import hashlib
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

KIT = Path(__file__).resolve().parent.parent
TOOLS = KIT / "tools"
FFMPEG_BIN = TOOLS / "ffmpeg" / "bin"
MODELS = KIT / "models"
REMOTION = KIT / "remotion"
PROJECTS = KIT / "projects"
PY_MAIN = KIT / "py" / "main" / ".venv" / "Scripts" / "python.exe"
PY_QWEN = KIT / "py" / "qwen" / ".venv" / "Scripts" / "python.exe"

# Everything that belongs to the person using the kit lives in user/ and is never versioned:
# profile.json (name, brand, defaults), voices/ (samples + tones.json), music/, brand/ (logo), notes.md.
USER = KIT / "user"
USER_VOICES = USER / "voices"
USER_MUSIC = USER / "music"


def profile() -> dict:
    """user/profile.json, or {} before the first-run setup (a BOM from Windows PowerShell is fine)."""
    f = USER / "profile.json"
    return json.loads(f.read_text(encoding="utf-8-sig")) if f.exists() else {}

SAMPLE_RATE = 24000  # Kokoro and Qwen3-TTS both output 24 kHz (tts_qwen.py resamples otherwise)


def setup_env() -> None:
    """Keep model downloads inside the kit and put our ffmpeg first on PATH."""
    os.environ["PATH"] = str(FFMPEG_BIN) + os.pathsep + os.environ.get("PATH", "")
    os.environ.setdefault("HF_HOME", str(MODELS / "hf"))
    os.environ.setdefault("TORCH_HOME", str(MODELS / "torch"))
    os.environ.setdefault("HF_HUB_DISABLE_SYMLINKS_WARNING", "1")
    # AVG sets SSLKEYLOGFILE to a device path; standalone Python builds abort on it
    # ("OPENSSL_Uplink ... no OPENSSL_Applink") at the first HTTPS request.
    os.environ.pop("SSLKEYLOGFILE", None)
    # AVG intercepts HTTPS; requests/huggingface use certifi unless told otherwise.
    avg = os.environ.get("NODE_EXTRA_CA_CERTS")
    if avg and Path(avg).exists() and "REQUESTS_CA_BUNDLE" not in os.environ:
        try:
            import certifi

            bundle = MODELS / "ca-bundle.pem"
            MODELS.mkdir(exist_ok=True)
            if not bundle.exists() or bundle.stat().st_mtime < Path(avg).stat().st_mtime:
                bundle.write_bytes(Path(certifi.where()).read_bytes() + b"\n" + Path(avg).read_bytes())
            os.environ["REQUESTS_CA_BUNDLE"] = str(bundle)
            os.environ["SSL_CERT_FILE"] = str(bundle)
        except ImportError:
            pass


def ffmpeg() -> str:
    return str(FFMPEG_BIN / "ffmpeg.exe") if (FFMPEG_BIN / "ffmpeg.exe").exists() else "ffmpeg"


def ffprobe() -> str:
    return str(FFMPEG_BIN / "ffprobe.exe") if (FFMPEG_BIN / "ffprobe.exe").exists() else "ffprobe"


def run(cmd: list[str], cwd: Path | None = None, quiet: bool = True) -> subprocess.CompletedProcess:
    res = subprocess.run(cmd, cwd=cwd, capture_output=quiet, text=True, encoding="utf-8", errors="replace")
    if res.returncode != 0:
        msg = (res.stderr or res.stdout or "")[-3000:] if quiet else ""
        raise RuntimeError(f"Command failed ({res.returncode}): {' '.join(map(str, cmd))[:300]}\n{msg}")
    return res


def probe(path: Path) -> dict:
    out = run([ffprobe(), "-v", "error", "-print_format", "json", "-show_format", "-show_streams", str(path)]).stdout
    return json.loads(out)


def duration(path: Path) -> float:
    return float(probe(path)["format"]["duration"])


def file_hash(path: Path) -> str:
    h = hashlib.sha1()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()[:16]


def text_hash(*parts) -> str:
    return hashlib.sha1(json.dumps(parts, sort_keys=True, ensure_ascii=False).encode("utf-8")).hexdigest()[:16]


def log(msg: str) -> None:
    print(msg, flush=True)


def which_remotion() -> str:
    exe = REMOTION / "node_modules" / ".bin" / ("remotion.cmd" if sys.platform == "win32" else "remotion")
    if not exe.exists():
        raise RuntimeError("Remotion is not installed: run `npm install` in video-kit/remotion")
    return str(exe)


def copy_if_newer(src: Path, dst: Path) -> None:
    dst.parent.mkdir(parents=True, exist_ok=True)
    if not dst.exists() or src.stat().st_mtime > dst.stat().st_mtime or src.stat().st_size != dst.stat().st_size:
        shutil.copy2(src, dst)
