"""Word-level captions with Whisper, corrected against the script text when we know it."""
from __future__ import annotations

import difflib
import re
from pathlib import Path

import kit

_model = {}


def _norm(w: str) -> str:
    return re.sub(r"[^\w]", "", w.lower())


def transcribe(audio: Path, language: str, prompt: str, model_name: str = "turbo") -> list[dict]:
    import torch
    import whisper

    if model_name not in _model:
        _model[model_name] = whisper.load_model(
            model_name, device="cuda" if torch.cuda.is_available() else "cpu", download_root=str(kit.MODELS / "whisper")
        )
    res = _model[model_name].transcribe(
        str(audio), language=language, word_timestamps=True, initial_prompt=prompt[:800] or None, fp16=torch.cuda.is_available()
    )
    words = []
    for seg in res["segments"]:
        for w in seg.get("words", []):
            words.append({"text": w["word"], "start": float(w["start"]), "end": float(w["end"]), "p": float(w.get("probability", 1))})
    return words


def align(words: list[dict], script: str) -> list[dict]:
    """Keep Whisper's timing but the script's spelling (product names, casing, punctuation)."""
    target = script.split()
    if not target or not words:
        return words
    a = [_norm(w["text"]) for w in words]
    b = [_norm(t) for t in target]
    out: list[dict] = []
    sm = difflib.SequenceMatcher(a=a, b=b, autojunk=False)
    for op, i1, i2, j1, j2 in sm.get_opcodes():
        if op == "equal" or (op == "replace" and i2 - i1 == j2 - j1):
            for k in range(i2 - i1):
                w = words[i1 + k]
                out.append({**w, "text": " " + target[j1 + k]})
        elif op == "replace":
            # Different word counts: spread the script words over the heard span.
            t0, t1 = words[i1]["start"], words[i2 - 1]["end"]
            n = j2 - j1
            for k in range(n):
                out.append({"text": " " + target[j1 + k], "start": t0 + (t1 - t0) * k / n, "end": t0 + (t1 - t0) * (k + 1) / n, "p": 0.5})
        elif op == "insert":
            # Script words Whisper missed: squeeze them in right after the previous word.
            t = out[-1]["end"] if out else words[0]["start"]
            for k in range(j2 - j1):
                out.append({"text": " " + target[j1 + k], "start": t, "end": t + 0.15, "p": 0.3})
                t += 0.15
        # "delete": Whisper heard something not in the script (breath, filler): drop it.
    return out


def to_remotion(words: list[dict]) -> list[dict]:
    caps = []
    for w in words:
        text = w["text"] if w["text"].startswith(" ") else " " + w["text"]
        # Whisper sometimes stretches the last word of a sentence over the following silence.
        end = min(max(w["end"], w["start"] + 0.05), w["start"] + 1.2)
        s, e = int(w["start"] * 1000), int(end * 1000)
        caps.append({"text": text, "startMs": s, "endMs": e, "timestampMs": (s + e) // 2, "confidence": round(w.get("p", 1), 3)})
    if caps:
        caps[0]["text"] = caps[0]["text"].lstrip()
    return caps


def to_srt(words: list[dict], max_chars: int = 42, max_gap: float = 0.6) -> str:
    """Plain subtitle file for platforms that take captions as an upload (LinkedIn, YouTube)."""
    lines, cur = [], []
    for w in words:
        if cur and (len("".join(x["text"] for x in cur)) + len(w["text"]) > max_chars or w["start"] - cur[-1]["end"] > max_gap):
            lines.append(cur)
            cur = []
        cur.append(w)
    if cur:
        lines.append(cur)

    def ts(t: float) -> str:
        ms = int(round(t * 1000))
        return f"{ms // 3600000:02}:{ms // 60000 % 60:02}:{ms // 1000 % 60:02},{ms % 1000:03}"

    out = []
    for i, line in enumerate(lines, 1):
        end = min(line[-1]["end"], line[-1]["start"] + 1.2)
        out.append(f"{i}\n{ts(line[0]['start'])} --> {ts(end)}\n{''.join(x['text'] for x in line).strip()}\n")
    return "\n".join(out)
