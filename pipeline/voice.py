"""Narration: Kokoro (synthetic), Qwen3-TTS (your cloned voice) or your own recordings."""
from __future__ import annotations

import json
import tempfile
from pathlib import Path

import numpy as np
import soundfile as sf

import kit

_kokoro = {}

# Cleanup for a voice recorded at home: cut rumble, tame noise, even out levels.
CLEAN_FILTER = "highpass=f=80,lowpass=f=14000,afftdn=nf=-25,acompressor=threshold=-20dB:ratio=3:attack=5:release=80"


def kokoro(text: str, voice: str, speed: float, out: Path) -> None:
    from kokoro import KPipeline

    lang = voice[0] if voice and voice[0] in "abefhijpz" else "a"
    if lang not in _kokoro:
        _kokoro[lang] = KPipeline(lang_code=lang, repo_id="hexgrad/Kokoro-82M")
    pipe = _kokoro[lang]
    parts = [np.asarray(audio, dtype=np.float32) for _, _, audio in pipe(text, voice=voice, speed=speed) if audio is not None]
    if not parts:
        raise RuntimeError(f"Kokoro produced no audio for: {text[:60]}")
    out.parent.mkdir(parents=True, exist_ok=True)
    sf.write(out, np.concatenate(parts), kit.SAMPLE_RATE)


def qwen(jobs: list[dict]) -> None:
    """Cloned voice (Qwen3-TTS) in its own venv; each job carries its text, sample and sample transcript."""
    if not jobs:
        return
    if not kit.PY_QWEN.exists():
        raise RuntimeError("Voice cloning environment missing: run setup.ps1 -Voice clone")
    for ref in {j["ref"] for j in jobs if j.get("ref") and j.get("ref_text")}:
        # A sample cut while still speaking leaves words in its transcript that the audio never says;
        # the clone then says them at the start of every line (a stray "free." before each scene).
        data, sr = sf.read(ref, dtype="float32", always_2d=True)
        tail = data.mean(axis=1)[-int(0.15 * sr):]
        if tail.size and float(np.sqrt((tail**2).mean())) > 0.02:
            print(f"  warning: voice sample {Path(ref).name} ends mid-speech; its last word may leak into every line. "
                  "Re-cut it at a word end (vk voice-setup --redo <tone>) and make its \"text\" match.", flush=True)
    with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False, encoding="utf-8") as f:
        json.dump({"jobs": jobs}, f, ensure_ascii=False)
    try:
        kit.run([str(kit.PY_QWEN), str(Path(__file__).with_name("tts_qwen.py")), f.name], quiet=False)
    finally:
        Path(f.name).unlink(missing_ok=True)


def recorded(src: Path, out: Path, clean: bool = True) -> None:
    """Your own take: convert to 24 kHz mono, clean it up and trim the silence at both ends."""
    trim = "silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.05"
    chain = ",".join(x for x in [CLEAN_FILTER if clean else "", trim, "areverse", trim, "areverse"] if x)
    out.parent.mkdir(parents=True, exist_ok=True)
    kit.run([kit.ffmpeg(), "-y", "-i", str(src), "-af", chain, "-ac", "1", "-ar", str(kit.SAMPLE_RATE), str(out)])


def load(path: Path) -> np.ndarray:
    data, sr = sf.read(path, dtype="float32", always_2d=False)
    if data.ndim > 1:
        data = data.mean(axis=1)
    if sr != kit.SAMPLE_RATE:
        raise RuntimeError(f"{path.name}: expected {kit.SAMPLE_RATE} Hz, got {sr}")
    return data


def mixdown(clips: list[tuple[float, Path]], total: float, out: Path) -> None:
    """Place each clip at its start time on one track, then normalise loudness for social video."""
    track = np.zeros(int(total * kit.SAMPLE_RATE) + kit.SAMPLE_RATE, dtype=np.float32)
    for start, path in clips:
        data = load(path)
        i = int(start * kit.SAMPLE_RATE)
        end = min(len(track), i + len(data))
        track[i:end] += data[: end - i]
    raw = out.with_name(out.stem + "_raw.wav")
    sf.write(raw, track[: int(total * kit.SAMPLE_RATE)], kit.SAMPLE_RATE)
    kit.run([kit.ffmpeg(), "-y", "-i", str(raw), "-af", "loudnorm=I=-16:TP=-1.5:LRA=11", "-ar", "48000", "-ac", "2", str(out)])
    raw.unlink(missing_ok=True)
