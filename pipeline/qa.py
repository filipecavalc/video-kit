"""vk qa <project>: automated checks on a rendered video, before anyone watches it.

  speech      Whisper on the final mix vs the script: words heard / words written (warn < 85%)
  pace        words per minute per narrated scene (warn > 200 or < 110; short lines read fast)
  loudness    integrated LUFS and true peak of the master (-14 LUFS, peak <= -1 dB)
  scenes      loudness per scene vs the median (warn if > 6 LU apart)
  black       black stretches >= 0.4 s (warn), first frame black (warn)
  frozen      frozen picture >= 3 s (info: cards and code can hold still on purpose)
  visual pace what happens above the captions: a fully still picture for >= 2.5 s (warn), and stretches
              >= 5 s where only small things move (info: a background drifting, a few typed characters).
              Good edits bring something new every 1.5-3.5 s.
  length      duration vs "target"
Writes out/<project>-<format>-qa.md and exits 1 if anything is a warning.
"""
from __future__ import annotations

import difflib
import json
import re
import statistics
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import kit  # noqa: E402

kit.setup_env()


def _norm(w: str) -> str:
    return re.sub(r"[^\w]", "", w.lower())


def still_stretches(video: Path, sample_fps: int = 5, threshold: float = 1.5) -> tuple[list[tuple[float, float]], float]:
    """Spans where the picture above the captions changes less than `threshold` (mean grey levels, 0-255, at
    96 px wide) over one second: about 0.1 for a frozen picture, 0.5-1.5 for a drifting background, typing or
    small packets, well above 2 for anything new. Returns the spans (seconds) and the share of the video
    covered by spans of 1.5 s or more."""
    import subprocess

    import numpy as np

    w = 96
    vf = f"fps={sample_fps},crop=iw:ih*0.72:0:0,scale={w}:-2,format=gray"
    raw = subprocess.run([kit.ffmpeg(), "-v", "error", "-i", str(video), "-vf", vf, "-f", "rawvideo", "-"], capture_output=True, check=True).stdout
    pgm = subprocess.run([kit.ffmpeg(), "-v", "error", "-i", str(video), "-vf", vf, "-frames:v", "1", "-f", "image2pipe", "-vcodec", "pgm", "-"],
                         capture_output=True, check=True).stdout
    h = int(pgm.split(b"\n")[1].split()[1])
    f = np.frombuffer(raw, np.uint8).reshape(-1, h, w).astype(np.float32)
    if len(f) <= sample_fps:
        return [], 0.0
    change = np.abs(f[sample_fps:] - f[:-sample_fps]).mean(axis=(1, 2))  # change over the second before each sample
    spans: list[tuple[float, float]] = []
    start = None
    for i, still in enumerate(list(change < threshold) + [False]):
        t = (i + sample_fps) / sample_fps
        if still and start is None:
            start = t - 1.0  # the window looks back one second
        elif not still and start is not None:
            spans.append((start, t - 1.0 / sample_fps))
            start = None
    share = sum(b - a for a, b in spans if b - a >= 1.5) / (len(f) / sample_fps)
    return spans, share


def run_qa(root: Path, fmt: str | None, preview: bool) -> int:
    spec =json.loads((root / "script.json").read_text(encoding="utf-8-sig"))
    if not fmt:
        f = spec.get("format", "4x5")
        fmt = f if isinstance(f, str) else f[0]
    video = root / "out" / f"{root.name}-{fmt}{'-preview' if preview else ''}.mp4"
    tl_file = root / "build" / f"timeline-{fmt}.json"
    if not video.exists() or not tl_file.exists():
        raise SystemExit(f"Render first: vk build {root.name} --format {fmt}{' --preview' if preview else ''}")
    tl = json.loads(tl_file.read_text(encoding="utf-8-sig"))
    fps = tl["fps"]
    rows: list[tuple[str, str, str]] = []  # (level, check, detail)

    def add(level: str, check: str, detail: str) -> None:
        rows.append((level, check, detail))

    # length
    dur = kit.duration(video)
    target = spec.get("target")
    if target:
        diff = dur - float(target)
        add("warn" if diff > float(target) * 0.1 else "ok", "length", f"{dur:.1f}s vs target {target}s ({diff:+.1f}s)")
    else:
        add("info", "length", f"{dur:.1f}s (no target)")

    # loudness of the master
    log = kit.run([kit.ffmpeg(), "-hide_banner", "-i", str(video), "-af", "ebur128=peak=true", "-vn", "-f", "null", "-"]).stderr
    lufs = float(re.findall(r"I:\s+(-?[\d.]+) LUFS", log)[-1])
    peak = float(re.findall(r"Peak:\s+(-?[\d.]+) dBFS", log)[-1])
    add("ok" if -16 <= lufs <= -12 else "warn", "loudness", f"{lufs:.1f} LUFS (target -14)")
    add("ok" if peak <= -1.0 else "warn", "true peak", f"{peak:.1f} dBFS (limit -1)")

    # loudness per scene (momentary, from the master)
    per_scene = []
    for sc in tl["scenes"]:
        a, b = sc["from"] / fps, (sc["from"] + sc["duration"]) / fps
        if b - a < 1.0:
            continue
        lg = kit.run([kit.ffmpeg(), "-hide_banner", "-ss", f"{a:.2f}", "-t", f"{b - a:.2f}", "-i", str(video), "-af", "ebur128", "-vn", "-f", "null", "-"]).stderr
        m = re.findall(r"I:\s+(-?[\d.]+) LUFS", lg)
        if m and float(m[-1]) > -70:
            per_scene.append((sc["id"], float(m[-1])))
    if per_scene:
        med = statistics.median(v for _, v in per_scene)
        odd = [f"{sid} {v:.1f}" for sid, v in per_scene if abs(v - med) > 6]
        add("warn" if odd else "ok", "scene loudness", f"median {med:.1f} LUFS" + (f"; off: {', '.join(odd)}" if odd else ""))

    # black and frozen picture
    lg = kit.run([kit.ffmpeg(), "-hide_banner", "-i", str(video), "-vf", "blackdetect=d=0.4:pix_th=0.08,freezedetect=n=0.002:d=3", "-an", "-f", "null", "-"]).stderr
    blacks = re.findall(r"black_start:([\d.]+) black_end:([\d.]+)", lg)
    add("warn" if blacks else "ok", "black frames", ", ".join(f"{float(a):.1f}-{float(b):.1f}s" for a, b in blacks) or "none")
    freezes = re.findall(r"freeze_start: ([\d.]+)", lg)
    freeze_ends = re.findall(r"freeze_end: ([\d.]+)", lg)
    if freezes:
        spans = [f"{float(a):.1f}-{float(b):.1f}s" for a, b in zip(freezes, freeze_ends + ["end"] * (len(freezes) - len(freeze_ends))) if b != "end"]
        add("info", "frozen picture", ", ".join(spans) + " (fine for cards/code holding still; check anything else)")

    # visual pace: something new on screen every few seconds
    frozen, share_frozen = still_stretches(video, threshold=0.3)
    quiet, share_quiet = still_stretches(video, threshold=1.5)

    def scene_at(t: float) -> str:
        sid = ""
        for sc in tl["scenes"]:
            if sc["from"] / fps <= t:
                sid = sc["id"]
        return sid

    def spans_text(spans: list[tuple[float, float]], minimum: float) -> str:
        long = sorted(sorted((sp for sp in spans if sp[1] - sp[0] >= minimum), key=lambda sp: sp[0] - sp[1])[:5])
        return ", ".join(f"{a:.1f}-{b:.1f}s ({scene_at(a + 0.1)})" for a, b in long)

    hint = " (cue a line, add a camera move or an annotate mark, or split the scene)"
    still_txt = spans_text(frozen, 2.5)
    add("warn" if still_txt else "ok", "still picture",
        (f"frozen at {still_txt}" + hint) if still_txt else f"never frozen for 2.5 s ({share_frozen:.0%} still in shorter holds)")
    quiet_txt = spans_text(quiet, 5.0)
    add("info" if quiet_txt else "ok", "visual pace",
        f"{share_quiet:.0%} of the video has only small motion" + (f"; long quiet stretches: {quiet_txt}" + hint if quiet_txt else ""))
    first = kit.run([kit.ffmpeg(), "-hide_banner", "-i", str(video), "-vf", "select=eq(n\\,0),signalstats,metadata=print", "-frames:v", "1", "-f", "null", "-"]).stderr
    yavg = re.findall(r"YAVG=([\d.]+)", first)
    if yavg:
        add("warn" if float(yavg[0]) < 20 else "ok", "first frame", f"average luma {float(yavg[0]):.0f}" + (" (nearly black: weak thumbnail/hook)" if float(yavg[0]) < 20 else ""))

    # speech: what Whisper hears in the final mix vs what the script says
    said = " ".join((s.get("say") or "") for s in spec["scenes"] if not s.get("talk"))
    if said.strip():
        import captions

        heard = captions.transcribe(video, spec.get("language", "en"), "")
        a = [_norm(w["text"]) for w in heard if _norm(w["text"])]
        b = [_norm(w) for w in said.split() if _norm(w)]
        ratio = difflib.SequenceMatcher(a=a, b=b, autojunk=False).ratio()
        add("ok" if ratio >= 0.85 else "warn", "speech match", f"{ratio:.0%} of the script heard in the final mix")

    # pace per narrated scene, from the caption words
    wf = root / "build" / "words.json"
    if wf.exists():
        words = json.loads(wf.read_text(encoding="utf-8-sig"))
        fast, slow = [], []
        for sc in tl["scenes"]:
            a, b = sc["from"] / fps, (sc["from"] + sc["duration"]) / fps
            ws = [w for w in words if a <= w["start"] < b]
            if len(ws) < 6:
                continue
            span = ws[-1]["end"] - ws[0]["start"]
            wpm = len(ws) / span * 60 if span > 0 else 0
            (fast if wpm > 200 else slow if wpm < 110 else []).append(f"{sc['id']} {wpm:.0f}")
        add("warn" if fast or slow else "ok", "pace (wpm)", "; ".join(x for x in [("fast: " + ", ".join(fast)) if fast else "", ("slow: " + ", ".join(slow)) if slow else ""] if x) or "110-200 everywhere")

    width = max(len(r[1]) for r in rows)
    icon = {"ok": "ok  ", "warn": "WARN", "info": "info"}
    lines = [f"{icon[lv]}  {chk.ljust(width)}  {det}" for lv, chk, det in rows]
    print("\n".join(lines))
    md = [f"# QA: {video.name}", "", "| result | check | detail |", "|---|---|---|"] + [f"| {lv} | {chk} | {det} |" for lv, chk, det in rows]
    (root / "out" / f"{root.name}-{fmt}-qa.md").write_text("\n".join(md) + "\n", encoding="utf-8")
    return 1 if any(lv == "warn" for lv, _, _ in rows) else 0
