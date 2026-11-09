"""Helpers for raw footage: cut silences out of a talking-head take, transcribe with timestamps,
and capture a scripted browser session (for web-app demos).

    vk cut <video> [--min-silence 0.45] [--threshold -35] [--punch]   -> <video>.cut.mp4
    vk transcribe <video> [--language en]                             -> <video>.transcript.md + .words.json
    vk capture <steps.json> [--out clip.mp4]                          -> clip.mp4 + clip.events.json
"""
from __future__ import annotations

import json
import os
import re
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import kit  # noqa: E402

kit.setup_env()
os.environ.setdefault("PLAYWRIGHT_BROWSERS_PATH", str(kit.TOOLS / "playwright"))


# ------------------------------------------------------------------ cut

def speech_segments(video: Path, min_silence: float, threshold: float, pad: float) -> list[tuple[float, float]]:
    """Spans with speech: everything that is not a silence of at least `min_silence` seconds."""
    res = kit.run([kit.ffmpeg(), "-hide_banner", "-i", str(video), "-af", f"silencedetect=noise={threshold}dB:d={min_silence}", "-f", "null", "-"])
    log = res.stderr
    starts = [float(x) for x in re.findall(r"silence_start: ([\d.]+)", log)]
    ends = [float(x) for x in re.findall(r"silence_end: ([\d.]+)", log)]
    total = kit.duration(video)
    keep, cursor = [], 0.0
    for s, e in zip(starts, ends + [total] * (len(starts) - len(ends))):
        if s - cursor > 0.15:
            keep.append((max(0.0, cursor - pad), min(total, s + pad)))
        cursor = e
    if total - cursor > 0.15:
        keep.append((max(0.0, cursor - pad), total))
    return keep


def cut(video: Path, min_silence: float = 0.45, threshold: float = -35, pad: float = 0.12, punch: bool = False) -> Path:
    keep = speech_segments(video, min_silence, threshold, pad)
    if not keep:
        raise SystemExit("No speech found (try a lower --threshold)")
    st = next(x for x in kit.probe(video)["streams"] if x.get("width"))
    w, h = st["width"], st["height"]
    parts, labels = [], []
    for i, (a, b) in enumerate(keep):
        zoom = punch and i % 2 == 1  # every other segment slightly punched in: hides the jump cut
        v = f"[0:v]trim={a:.3f}:{b:.3f},setpts=PTS-STARTPTS" + (f",scale={int(w * 1.12) // 2 * 2}:-2,crop={w}:{h}" if zoom else "") + f"[v{i}]"
        au = f"[0:a]atrim={a:.3f}:{b:.3f},asetpts=PTS-STARTPTS,afade=t=in:d=0.02,afade=t=out:st={max(0, b - a - 0.02):.3f}:d=0.02[a{i}]"
        parts += [v, au]
        labels.append(f"[v{i}][a{i}]")
    graph = ";".join(parts) + ";" + "".join(labels) + f"concat=n={len(keep)}:v=1:a=1[v][a]"
    out = video.with_name(video.stem + ".cut.mp4")
    kit.run([kit.ffmpeg(), "-y", "-i", str(video), "-filter_complex", graph, "-map", "[v]", "-map", "[a]",
             "-c:v", "libx264", "-crf", "18", "-preset", "fast", "-c:a", "aac", "-b:a", "192k", str(out)])
    before, after = kit.duration(video), kit.duration(out)
    print(f"{video.name}: {before:.1f}s -> {after:.1f}s ({len(keep)} segments, {before - after:.1f}s of silence removed)")
    return out


# ------------------------------------------------------------------ transcribe

def transcribe(video: Path, language: str | None) -> Path:
    import captions

    words = captions.transcribe(video, language or "en", "")
    (video.with_suffix(".words.json")).write_text(json.dumps(words, indent=1, ensure_ascii=False), encoding="utf-8")
    # Sentences with start/end, to pick segments for shorts: trim = [start, end].
    lines, cur = [], []
    for w in words:
        cur.append(w)
        if w["text"].strip()[-1:] in ".?!" or (len(cur) > 1 and w["start"] - cur[-2]["end"] > 1.0):
            lines.append(cur)
            cur = []
    if cur:
        lines.append(cur)
    md = [f"# Transcript: {video.name}", "", "| start | end | text |", "|---:|---:|---|"]
    md += [f"| {l[0]['start']:.1f} | {l[-1]['end']:.1f} | {''.join(x['text'] for x in l).strip()} |" for l in lines]
    out = video.with_suffix(".transcript.md")
    out.write_text("\n".join(md) + "\n", encoding="utf-8")
    print(out)
    return out


# ------------------------------------------------------------------ capture

def capture(steps_file: Path, out: Path | None) -> Path:
    """Run a scripted browser session and record it, logging where each click landed.

    steps.json: {"url": "http://localhost:3000", "size": [1920, 1080], "steps": [
        {"wait": 1}, {"click": "text=Sign in"}, {"type": ["#email", "demo@example.com"]},
        {"press": "Enter"}, {"scroll": 600}, {"hover": "#chart"}, {"goto": "http://..."}]}
    """
    from playwright.sync_api import sync_playwright

    spec = json.loads(steps_file.read_text(encoding="utf-8"))
    w, h = spec.get("size", [1920, 1080])
    url = spec["url"]
    if "://" not in url:  # a local file, relative to the steps file's folder or its parent
        for base in (steps_file.parent, steps_file.parent.parent):
            if (base / url).exists():
                url = (base / url).resolve().as_uri()
                break
    spec["url"] = url
    out = out or steps_file.with_suffix(".mp4")
    tmp = out.parent / "_capture"
    tmp.mkdir(parents=True, exist_ok=True)
    events = {"size": [w, h], "clicks": []}
    with sync_playwright() as p:
        browser = p.chromium.launch()
        ctx = browser.new_context(viewport={"width": w, "height": h}, record_video_dir=str(tmp), record_video_size={"width": w, "height": h}, device_scale_factor=1)
        page = ctx.new_page()
        t0 = time.monotonic()
        page.goto(spec["url"], wait_until="networkidle")
        for st in spec.get("steps", []):
            if "wait" in st:
                page.wait_for_timeout(float(st["wait"]) * 1000)
            elif "click" in st or "hover" in st:
                sel = st.get("click") or st.get("hover")
                box = page.locator(sel).first.bounding_box()
                if box:
                    cx, cy = box["x"] + box["width"] / 2, box["y"] + box["height"] / 2
                    page.mouse.move(cx, cy, steps=12)
                    if "click" in st:
                        events["clicks"].append({"t": round(time.monotonic() - t0, 3), "x": round(cx / w, 4), "y": round(cy / h, 4), "target": sel})
                        page.mouse.click(cx, cy)
                page.wait_for_timeout(600)
            elif "type" in st:
                sel, text = st["type"]
                page.locator(sel).first.click()
                page.keyboard.type(text, delay=60)
            elif "press" in st:
                page.keyboard.press(st["press"])
            elif "scroll" in st:
                page.mouse.wheel(0, float(st["scroll"]))
                page.wait_for_timeout(700)
            elif "goto" in st:
                page.goto(st["goto"], wait_until="networkidle")
        page.wait_for_timeout(800)
        video_path = page.video.path()
        ctx.close()
        browser.close()
    kit.run([kit.ffmpeg(), "-y", "-i", str(video_path), "-c:v", "libx264", "-crf", "18", "-pix_fmt", "yuv420p", "-r", "30", str(out)])
    Path(video_path).unlink(missing_ok=True)
    try:
        tmp.rmdir()
    except OSError:
        pass
    ev = out.with_suffix(".events.json")
    ev.write_text(json.dumps(events, indent=1), encoding="utf-8")
    print(f"{out}\n{ev}  ({len(events['clicks'])} clicks)")
    return out


def main(argv: list[str]) -> None:
    import argparse

    ap = argparse.ArgumentParser(prog="vk")
    sub = ap.add_subparsers(dest="cmd", required=True)
    c = sub.add_parser("cut")
    c.add_argument("video")
    c.add_argument("--min-silence", type=float, default=0.45)
    c.add_argument("--threshold", type=float, default=-35)
    c.add_argument("--pad", type=float, default=0.12)
    c.add_argument("--punch", action="store_true")
    t = sub.add_parser("transcribe")
    t.add_argument("video")
    t.add_argument("--language")
    cp = sub.add_parser("capture")
    cp.add_argument("steps")
    cp.add_argument("--out")
    a = ap.parse_args(argv)
    if a.cmd == "cut":
        cut(Path(a.video).resolve(), a.min_silence, a.threshold, a.pad, a.punch)
    elif a.cmd == "transcribe":
        transcribe(Path(a.video).resolve(), a.language)
    else:
        capture(Path(a.steps).resolve(), Path(a.out).resolve() if a.out else None)


if __name__ == "__main__":
    main(sys.argv[1:])
