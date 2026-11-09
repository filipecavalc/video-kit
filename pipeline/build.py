"""video-kit: script.json -> narration -> captions -> timeline -> MP4 (Remotion).

    vk new <project>                      create a project from the template
    vk build <project> [options]          run everything that changed and render
        --format 4x5,9x16                 override the formats in script.json
        --preview                         half resolution, fast check
        --no-render                       stop after timeline.json
        --gif                             also export a GIF (for READMEs)
    vk still <project> [--frame N | --at SECONDS] [--format F] [--grid]
    vk studio <project> [--format F]      open the Remotion Studio on this project
    vk voices                             list Kokoro voices

Projects live in video-kit/projects/<name>/ (or pass a path). Every path inside script.json
is relative to the project folder. Outputs go to <project>/out/, intermediates to <project>/build/.
"""
from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import kit  # noqa: E402

kit.setup_env()

VIDEO_EXT = {".mp4", ".mov", ".mkv", ".webm", ".avi", ".m4v"}
IMAGE_EXT = {".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp"}
TEMPLATE = Path(__file__).resolve().parent / "template_script.json"


# --------------------------------------------------------------------------- helpers

def with_profile(spec: dict) -> dict:
    """Fill what the script leaves out from user/profile.json: brand, voice, language, style.

    The script always wins; the profile only supplies the person's defaults so scripts stay short.
    """
    prof = kit.profile()
    out = dict(spec)
    brand = {**prof.get("brand", {}), **spec.get("brand", {})}
    if brand:
        out["brand"] = brand
    for key, pkey in (("voice", "voice"), ("language", "default_language"), ("style", "style")):
        if key not in out and prof.get(pkey):
            out[key] = prof[pkey]
    return out


def project_dir(name: str) -> Path:
    p = Path(name)
    if p.is_dir():
        return p.resolve()
    return (kit.PROJECTS / name).resolve()


def load_cache(build: Path) -> dict:
    f = build / "cache.json"
    return json.loads(f.read_text(encoding="utf-8")) if f.exists() else {}


def save_cache(build: Path, cache: dict) -> None:
    (build / "cache.json").write_text(json.dumps(cache, indent=2), encoding="utf-8")


def rel(path: Path, root: Path) -> str:
    return path.resolve().relative_to(root).as_posix()


def resolve_in(root: Path, value: str) -> Path:
    # "file.pdf#3" = page 3 of a PDF, rendered to a PNG in build/pdf/
    page = None
    if "#" in value and value.lower().split("#")[0].endswith(".pdf"):
        value, page = value.rsplit("#", 1)
    p = Path(value)
    if not p.is_absolute():
        p = root / p
    if not p.exists() and (kit.KIT / value).exists():
        p = kit.KIT / value
    if not p.exists() and (kit.USER / value).exists():  # "voices/x.wav", "music/x.mp3", "brand/logo.svg"
        p = kit.USER / value
    p = p.resolve()
    if p.suffix.lower() == ".pdf" and p.exists():
        return pdf_page(root, p, int(page or 1))
    if not p.exists() and os.environ.get("VK_PLACEHOLDERS") and (p.suffix.lower() in IMAGE_EXT | VIDEO_EXT):
        return placeholder(root, p)
    return p


def placeholder(root: Path, missing: Path) -> Path:
    """Grey card naming the file still to be provided (draft renders with --placeholders)."""
    from PIL import Image, ImageDraw, ImageFont

    out = root / "build" / "placeholders" / f"{missing.stem}.png"
    if out.exists():
        return out
    out.parent.mkdir(parents=True, exist_ok=True)
    img = Image.new("RGB", (1600, 1200), "#3A3F47")
    d = ImageDraw.Draw(img)
    try:
        font = ImageFont.truetype(str(kit.TOOLS / "fonts" / "Inter.ttf"), 64)
        small = ImageFont.truetype(str(kit.TOOLS / "fonts" / "Inter.ttf"), 40)
    except OSError:
        font = small = ImageFont.load_default()
    d.rectangle([20, 20, 1580, 1180], outline="#F5A524", width=6)
    d.text((800, 540), "TO PROVIDE", fill="#F5A524", font=small, anchor="mm")
    d.text((800, 630), missing.name, fill="#FFFFFF", font=font, anchor="mm")
    img.save(out)
    return out


def pdf_page(root: Path, pdf: Path, page: int, width: int = 2400) -> Path:
    """Render one PDF page (1-based) to PNG on a white background, sized for video."""
    out = root / "build" / "pdf" / f"{pdf.stem}_p{page}.png"
    if out.exists() and out.stat().st_mtime >= pdf.stat().st_mtime:
        return out
    import fitz  # PyMuPDF

    out.parent.mkdir(parents=True, exist_ok=True)
    with fitz.open(pdf) as doc:
        pg = doc[page - 1]
        zoom = width / pg.rect.width
        pg.get_pixmap(matrix=fitz.Matrix(zoom, zoom), alpha=False).save(out)
    return out


# --------------------------------------------------------------------------- stages

def stage_voice(root: Path, spec: dict, scenes: list[dict], cache: dict) -> dict[str, Path]:
    """One narration clip per scene that has `say`. Re-synthesised only when text/voice change."""
    import voice

    base = spec.get("voice") or {"engine": "kokoro", "voice": "am_michael"}
    # "pronounce": {"FreeCAD": "Free CAD"} changes only what the voice says; captions keep the script spelling.
    pronounce = spec.get("pronounce", {})

    def spoken(text: str) -> str:
        for word, sound in pronounce.items():
            text = text.replace(word, sound)
        return text

    tones_file = kit.USER_VOICES / "tones.json"
    tones = json.loads(tones_file.read_text(encoding="utf-8")) if tones_file.exists() else {}
    default_speaker = kit.profile().get("speaker", "me")
    warned: list[bool] = []

    def scene_cfg(s: dict) -> dict:
        """Video voice settings, overridden by the scene's own "voice" (dict, or just a tone name).

        A "tone" fills ref / text / temperature from user/voices/tones.json (per speaker, default from
        user/profile.json); keys written explicitly in the scene still win.
        """
        own = s.get("voice") or {}
        if isinstance(own, str):
            own = {"tone": own}
        cfg = {**base, **own}
        if cfg.get("engine") == "chatterbox":  # replaced by qwen in 0.5; old scripts and profiles keep working
            if not warned:
                kit.log("  voice engine 'chatterbox' was replaced by 'qwen': using qwen (update the script or profile)")
                warned.append(True)
            cfg["engine"] = "qwen"
        tone = cfg.get("tone")
        if cfg.get("engine", "kokoro") == "qwen" and tone:
            speaker = cfg.get("speaker", default_speaker)
            lang = spec.get("language", "en")
            # A sample recorded in the video's language beats an English one ("narracao" -> "narracao_pt").
            if lang != "en" and f"{tone}_{lang}" in tones.get(speaker, {}):
                tone = f"{tone}_{lang}"
            preset = tones.get(speaker, {}).get(tone)
            if preset is None:
                preset = {"ref": f"voices/{speaker}_{tone}.wav"}
            for key, value in preset.items():
                if key not in own:
                    cfg[key] = value
        return cfg

    out_dir = root / "build" / "voice"
    clips: dict[str, Path] = {}
    pending_clone = []
    vc = cache.setdefault("voice", {})

    for s in scenes:
        if s.get("talk"):
            # The scene's own clip is the narration: take its audio (trimmed, sped up, cleaned).
            src = resolve_in(root, s["media"])
            trim = s.get("trim") or [0, None]
            speed = float(s.get("speed", 1.0))
            out = out_dir / f"{s['id']}.wav"
            key = kit.text_hash("talk", kit.file_hash(src), trim, speed)
            if vc.get(s["id"]) != key or not out.exists():
                kit.log(f"  talk audio: {s['id']}")
                out.parent.mkdir(parents=True, exist_ok=True)
                cmd = [kit.ffmpeg(), "-y"]
                if trim[0]:
                    cmd += ["-ss", str(trim[0])]
                if len(trim) > 1 and trim[1] is not None:
                    cmd += ["-to", str(trim[1])]
                chain = ",".join(x for x in [f"atempo={speed}" if speed != 1 else "", voice.CLEAN_FILTER] if x)
                kit.run(cmd + ["-i", str(src), "-vn", "-af", chain, "-ac", "1", "-ar", str(kit.SAMPLE_RATE), str(out)])
            vc[s["id"]] = key
            clips[s["id"]] = out
            continue
        cfg = scene_cfg(s)
        engine = cfg.get("engine", "kokoro")
        text = spoken((s.get("say") or "").strip())
        if not text or engine == "none":
            continue
        out = out_dir / f"{s['id']}.wav"
        if engine == "recorded":
            src = root / "audio" / "rec" / f"{s['id']}.wav"
            if not src.exists():
                cands = list((root / "audio" / "rec").glob(f"{s['id']}.*"))
                if not cands:
                    raise RuntimeError(f"Missing recording for scene '{s['id']}': put it in audio/rec/{s['id']}.wav")
                src = cands[0]
            key = kit.text_hash("rec", kit.file_hash(src), cfg.get("clean", True))
            if vc.get(s["id"]) != key or not out.exists():
                kit.log(f"  cleaning recording: {s['id']}")
                voice.recorded(src, out, clean=cfg.get("clean", True))
        elif engine == "kokoro":
            v, speed = cfg.get("voice", "am_michael"), float(cfg.get("speed", 1.0))
            key = kit.text_hash("kokoro", text, v, speed)
            if vc.get(s["id"]) != key or not out.exists():
                kit.log(f"  kokoro ({v}): {s['id']}")
                voice.kokoro(text, v, speed, out)
        elif engine == "qwen":
            if not cfg.get("ref"):
                raise RuntimeError(f"Scene '{s['id']}': the qwen engine needs a voice sample: a \"tone\" from "
                                   "user/voices/tones.json (vk voice-setup) or \"ref\"")
            ref = resolve_in(root, cfg["ref"])
            if not ref.exists():
                raise RuntimeError(f"Scene '{s['id']}': voice sample not found: {ref}")
            ref_text = cfg.get("text")
            if not ref_text:
                kit.log(f"  warning: no transcript for {ref.name} (\"text\" in tones.json): the clone will sound less "
                        "like you; vk voice-setup fills it in")
            lang = spec.get("language", "en")
            temp = cfg.get("temperature")
            seed = int(cfg.get("seed", 1))
            key = kit.text_hash("qwen", text, kit.file_hash(ref), ref_text, temp, seed, lang)
            if vc.get(s["id"]) != key or not out.exists():
                pending_clone.append({"text": text, "out": str(out), "ref": str(ref), "ref_text": ref_text,
                                      "language": lang, "temperature": temp, "seed": seed})
        else:
            raise RuntimeError(f"Unknown voice engine: {engine}")
        vc[s["id"]] = key
        clips[s["id"]] = out

    if pending_clone:
        kit.log(f"  qwen (cloned voice): {len(pending_clone)} clip(s)")
        voice.qwen(pending_clone)  # each job carries its own sample and settings
    return clips


def stage_manim(root: Path, s: dict, size: tuple[int, int], cache: dict, theme: dict) -> Path:
    """Render a Manim scene (file.py:SceneClass) to MP4 at the video's resolution."""
    import os

    file, _, cls = s["manim"].partition(":")
    src = resolve_in(root, file)
    out_dir = root / "build" / "manim"
    helper = Path(__file__).resolve().parent / "vk_manim.py"
    key = kit.text_hash("manim", kit.file_hash(src), kit.file_hash(helper), cls, size, theme)
    target = out_dir / f"{s['id']}.mp4"
    mc = cache.setdefault("manim", {})
    if mc.get(s["id"]) == key and target.exists():
        return target
    kit.log(f"  manim: {s['manim']}")
    media = out_dir / "_media"
    os.environ["PYTHONPATH"] = str(helper.parent) + os.pathsep + os.environ.get("PYTHONPATH", "")
    os.environ["VK_THEME"] = json.dumps(theme)
    kit.run(
        [str(kit.PY_MAIN), "-m", "manim", "render", "-q", "h", "--fps", "30", "-r", f"{size[0]},{size[1]}",
         "--media_dir", str(media), "--disable_caching", str(src), cls],
        cwd=src.parent,
    )
    found = sorted(media.rglob(f"{cls}.mp4"), key=lambda p: p.stat().st_mtime)
    if not found:
        raise RuntimeError(f"Manim did not produce {cls}.mp4")
    out_dir.mkdir(parents=True, exist_ok=True)
    shutil.copy2(found[-1], target)
    mc[s["id"]] = key
    return target


DEV_KINDS = ("terminal", "code", "diagram", "git", "kinetic", "stats", "model")


def dev_natural_length(kind: str, d: dict) -> float:
    """Length of a developer scene when nothing is narrated over it."""
    if kind == "terminal":
        def one(l: dict) -> float:
            if l.get("cmd"):
                return min(2.4, 0.06 * len(l["cmd"])) + 0.9
            if l.get("stream"):
                return float(l.get("for", min(2.2, 0.6 + 0.06 * len(l["stream"])))) + 0.4
            return 1.4 if l.get("count") is not None else 0.35
        return 1.0 + sum(one(l) for l in d.get("lines", []))
    if kind == "stats":
        return 1.5 + 1.3 * len(d.get("items", []))
    if kind == "model":
        return 6.0
    if kind == "code":
        return max(4.0, 2.5 * len(d.get("focus", [])) + (2.5 if d.get("before") else 0))
    if kind == "diagram":
        return max(4.0, 1.5 + 1.2 * len(d.get("flows", [])))
    if kind == "git":
        return 7.0
    return 3.0  # kinetic title


def dev_scene_data(root: Path, kind: str, s: dict, local) -> dict:
    """Turn the script's description into what the Remotion template draws (frames filled in later)."""
    import devscenes

    d = s[kind]
    if kind == "terminal":
        return {"terminal": {"title": d.get("title", "terminal"), "prompt": d.get("prompt", "$"),
                             "lines": [{k: v for k, v in l.items() if k not in ("cue", "at")} for l in d["lines"]]}}
    if kind == "model":
        src = resolve_in(root, d["src"])
        if not src.exists():
            raise RuntimeError(f"Scene '{s['id']}': model not found: {d['src']}")
        out = {k: d[k] for k in ("az", "el", "spin", "zoom", "edges", "colors") if k in d}
        out["src"] = rel(local(src), root)
        if d.get("explode"):
            out["explode"] = {k: d["explode"][k] for k in ("amount",) if k in d["explode"]}
        out["labels"] = [{"part": l["part"], "text": l["text"]} for l in d.get("labels", [])]
        out["highlight"] = [{k: h[k] for k in ("part", "color") if k in h} for h in d.get("highlight", [])]
        return {"model": out}
    if kind == "stats":
        keys = ("value", "label", "prefix", "suffix", "decimals", "bar", "from")
        return {"stats": {"title": d.get("title"), "items": [{k: it[k] for k in keys if k in it} for it in d["items"]]}}
    if kind == "code":
        def read(v):
            p = resolve_in(root, v) if isinstance(v, str) and not v.startswith("\n") and len(v) < 260 and "\n" not in v else None
            return (p.read_text(encoding="utf-8"), p.name) if p and p.exists() else (v, None)

        lang = d.get("lang")
        if d.get("before") is not None:
            before, fname = read(d["before"])
            after, fname2 = read(d["after"])
            lines = devscenes.diff_lines(before, after, lang, d.get("filename") or fname2 or fname)
            out = {"title": d.get("title") or fname2 or "diff", "lines": lines, "diff": True}
        else:
            text, fname = read(d.get("file") or d.get("text", ""))
            rng = d.get("lines") or [1, None]
            lines = devscenes.code_lines(text, lang, d.get("filename") or fname, rng[0], rng[1])
            out = {"title": d.get("title") or fname or "code", "lines": lines}
        return {"code": out}
    if kind == "diagram":
        vertical = d.get("vertical")
        if vertical is None:  # portrait formats read better top-to-bottom; decided per build format later
            vertical = False
        nodes = devscenes.layout_diagram(d["nodes"], d.get("edges", []), vertical)
        return {"diagram": {"title": d.get("title"), "nodes": nodes, "edges": d.get("edges", []), "vertical": vertical,
                            "autoOrient": d.get("vertical") is None, **({"ambient": False} if d.get("ambient") is False else {})}}
    if kind == "git":
        repo = resolve_in(root, d["repo"])
        data = devscenes.git_history(repo, d.get("since"), d.get("until"), d.get("path"))
        n = int(d.get("highlights", 4))
        commits = data["commits"]
        # Highlights: the biggest commits, shown in time order; or the ones named in "pick" (substring match).
        if d.get("pick"):
            idx = [i for i, c in enumerate(commits) if any(p.lower() in c["msg"].lower() for p in d["pick"])]
        else:
            idx = sorted(sorted(range(len(commits)), key=lambda i: -(commits[i]["add"] + commits[i]["del"]))[:n])
        data["highlights"] = idx
        if d.get("title"):
            data["repo"] = d["title"]
        return {"git": data}
    k = {"text": d["text"]}
    for key in ("sub", "mark", "align", "motion"):
        if d.get(key):
            k[key] = d[key]
    if d.get("exit") is False:
        k["exit"] = False
    for key in ("logo", "media"):
        if d.get(key):
            src = resolve_in(root, d[key])
            if not src.exists():
                raise RuntimeError(f"Scene '{s['id']}': kinetic {key} not found: {d[key]}")
            k[key] = rel(local(src), root)
    return {"kinetic": k}


def for_format(timeline: dict, fmt: str) -> dict:
    """Per-format tweaks: diagrams without an explicit orientation run top-to-bottom in portrait formats;
    camera and annotate items with a "format" only apply to that format."""
    import copy

    t = copy.deepcopy(timeline)
    t["format"] = fmt
    portrait = fmt in ("9x16", "4x5")
    for sc in t["scenes"]:
        # Camera points and marks are positions on the frame: an item can be limited to one format.
        for key in ("camera", "annotate"):
            if key in sc:
                sc[key] = [x for x in sc[key] if x.get("format", fmt) == fmt]
        d = sc.get("diagram")
        if d and d.get("autoOrient") and portrait and not d.get("vertical"):
            for n in d["nodes"]:
                n["x"], n["y"] = n["y"], n["x"]
            d["vertical"] = True
    return t


def time_screen_polish(root: Path, placed: list, timeline_scenes: list, words: list[dict], fps: int) -> None:
    """Zooms and clicks on video/image scenes, in scene frames.

    "zoom":   [{"at": 3.0 | "cue": "word", "x": 0.7, "y": 0.2, "scale": 1.8, "hold": 1.5}]
    "clicks": [{"at": 4.2 | "cue": "word", "x": 0.7, "y": 0.2}]
    "events": "capture.events.json" from `vk capture` (source-clip seconds; trim and speed applied),
              each click becomes a click plus a zoom unless "auto_zoom": false.
    """
    for s, start, length, media, mtype, speech in placed:
        if not (s.get("zoom") or s.get("clicks") or s.get("events")):
            continue
        sc = timeline_scenes[s["_tl"]]
        trim0 = float((s.get("trim") or [0])[0] or 0)
        speed = float(s.get("speed", 1.0))

        def at(item: dict) -> float | None:
            if item.get("cue") and words:
                t = cue_time(words, item["cue"], start, start + length)
                return None if t is None else t - start
            return float(item["at"]) if "at" in item else None

        zooms, clicks = list(s.get("zoom", [])), list(s.get("clicks", []))
        if s.get("events"):
            ev = json.loads(resolve_in(root, s["events"]).read_text(encoding="utf-8"))
            for e in ev.get("clicks", []):
                t = (float(e["t"]) - trim0) / speed
                if 0 <= t <= length:
                    clicks.append({"at": t, "x": e["x"], "y": e["y"]})
                    if s.get("auto_zoom", True):
                        zooms.append({"at": max(0, t - 0.6), "x": e["x"], "y": e["y"], "scale": s.get("zoom_scale", 1.7), "hold": 1.4})
        sc["zooms"] = [{"at": round(t * fps), "dur": round(float(z.get("hold", 1.5)) * fps), "x": z["x"], "y": z["y"], "scale": float(z.get("scale", 1.8))}
                       for z in zooms if (t := at(z)) is not None]
        sc["clicks"] = [{"at": round(t * fps), "x": c["x"], "y": c["y"]} for c in clicks if (t := at(c)) is not None]
        sc["clicks"].sort(key=lambda c: c["at"])


def time_dev_scenes(placed: list, timeline_scenes: list, words: list[dict], fps: int) -> None:
    """Frames for code focus steps, the diff turn-over, diagram packets, terminal lines and stats: at a spoken
    word ("cue"), at a time ("at", seconds from the scene start) or spread evenly over the scene."""
    for s, start, length, media, mtype, speech in placed:
        if mtype not in ("code", "diagram", "terminal", "stats", "model"):
            continue
        sc = timeline_scenes[s["_tl"]]
        d = s[mtype]

        def frame_of(item: dict, k: int, n: int) -> int:
            t = None
            if item.get("cue") and words:
                t = cue_time(words, item["cue"], start, start + length)
                if t is not None:
                    t -= start + 0.1
            if t is None and "at" in item:
                t = float(item["at"])
            if t is None:
                t = 0.4 + (length - 1.0) * k / max(1, n)
            return max(0, round(t * fps))

        if mtype == "model":
            # Explode, labels and highlights at a word or a time; untimed ones arrive in order over the scene.
            m = sc["model"]
            if d.get("explode"):
                m["explode"]["at"] = frame_of(d["explode"], 1, 3)
                if "hold" in d["explode"]:
                    m["explode"]["hold"] = round(float(d["explode"]["hold"]) * fps)
            for key in ("labels", "highlight"):
                items = d.get(key, [])
                for k, it in enumerate(items):
                    m[key][k]["at"] = frame_of(it, k + 1, len(items) + 1)
                    if "hold" in it:
                        m[key][k]["hold"] = round(float(it["hold"]) * fps)
            continue
        if mtype in ("terminal", "stats"):
            # Only timed when asked: untimed terminal lines follow each other; untimed stats arrive on a stagger.
            items = d["lines"] if mtype == "terminal" else d["items"]
            for k, it in enumerate(items):
                if it.get("cue") or "at" in it:
                    sc[mtype]["lines" if mtype == "terminal" else "items"][k]["at"] = frame_of(it, k, len(items))
            continue
        if mtype == "code":
            steps = d.get("focus", [])
            sc["code"]["focus"] = [{"from": f["lines"][0], "to": f["lines"][1], "at": frame_of(f, k, len(steps))} for k, f in enumerate(steps)]
            if sc["code"].get("diff"):
                sc["code"]["diffAt"] = frame_of(d.get("turn", {"at": length * 0.35}), 0, 1)
        else:
            flows = d.get("flows", [])
            first_ready = 0.25 + 0.45 * (max(n["level"] for n in sc["diagram"]["nodes"]) + 1) + 0.8
            sc["diagram"]["flows"] = [
                {"path": f["path"], "color": f.get("color"),
                 "at": max(round(first_ready * fps), frame_of(f, k, len(flows)))} for k, f in enumerate(flows)
            ]


def time_overlays(placed: list, timeline_scenes: list, words: list[dict], fps: int) -> None:
    """Camera moves and hand-drawn marks, on any scene: at a spoken word ("cue") or a time ("at", seconds from
    the scene start). In a slideshow they go to the image on screen at that moment.

    "camera":   [{"cue": "word", "x": 0.5, "y": 0.3, "scale": 1.6, "hold": 2}]
    "annotate": [{"cue": "word", "type": "circle", "x": 0.2, "y": 0.4, "w": 0.3, "h": 0.05, "hold": 2}]
    """
    for s, start, length, media, mtype, speech in placed:
        if not (s.get("camera") or s.get("annotate")):
            continue
        n = len(media) if mtype == "images" else 1
        targets = [timeline_scenes[s["_tl"] + i] for i in range(n)]

        def when(item: dict) -> float | None:
            if item.get("cue") and words:
                t = cue_time(words, item["cue"], start, start + length)
                if t is not None:
                    return t - start - 0.1
            return float(item["at"]) if "at" in item else None

        for key, fields in (("camera", ("x", "y", "scale", "format")), ("annotate", ("type", "x", "y", "w", "h", "color", "format"))):
            for item in s.get(key, []):
                t = when(item)
                if t is None:
                    kit.log(f"  ! scene '{s['id']}': {key} item without a heard cue or 'at': {item}")
                    continue
                sc = next((x for x in reversed(targets) if x["from"] <= round((start + max(0.0, t)) * fps)), targets[0])
                at = round((start + max(0.0, t)) * fps) - sc["from"]
                out = {f: item[f] for f in fields if f in item}
                out["at"] = at
                if "hold" in item:
                    out["hold"] = round(float(item["hold"]) * fps)
                sc.setdefault(key, []).append(out)


def _norm_word(w: str) -> str:
    import re

    return re.sub(r"[^\w]", "", w.lower())


def cue_time(words: list[dict], cue: str, t0: float, t1: float) -> float | None:
    """Start time of the first spoken word that begins with `cue`, inside [t0, t1]."""
    target = _norm_word(cue.split()[0])
    for w in words:
        if t0 - 0.2 <= w["start"] <= t1 and _norm_word(w["text"]).startswith(target):
            return float(w["start"])
    return None


def sync_slideshows(placed: list, timeline_scenes: list, words: list[dict], fps: int) -> None:
    """Slideshow items with "cue" switch when that word is spoken; the others share the gaps evenly."""
    for s, start, length, media, mtype, speech in placed:
        if mtype != "images":
            continue
        items = s["media"]
        cues = [m.get("cue") if isinstance(m, dict) else None for m in items]
        if not any(cues[1:]):
            continue
        if not words:
            kit.log(f"  ! scene '{s['id']}': cues need narration with captions; using equal parts")
            continue
        n, end = len(items), start + length
        bounds: list[float | None] = [start] + [None] * (n - 1) + [end]
        for k in range(1, n):
            if cues[k]:
                t = cue_time(words, cues[k], start, end)
                if t is None:
                    kit.log(f"  ! scene '{s['id']}': cue '{cues[k]}' not heard; placing item {k + 1} evenly")
                else:
                    bounds[k] = t - 0.12  # switch just before the word lands
        # fill the unknown boundaries evenly between known ones, then keep every item >= 0.6 s
        k = 0
        while k < n:
            j = k + 1
            while bounds[j] is None:
                j += 1
            for m in range(k + 1, j):
                bounds[m] = bounds[k] + (bounds[j] - bounds[k]) * (m - k) / (j - k)
            k = j
        for k in range(1, n + 1):
            bounds[k] = max(bounds[k], bounds[k - 1] + 0.6)
        bounds[n] = end
        i0 = s["_tl"]
        for k in range(n):
            a, b = round(bounds[k] * fps), round(min(bounds[k + 1], end) * fps)
            timeline_scenes[i0 + k]["from"] = a
            timeline_scenes[i0 + k]["duration"] = max(1, b - a)


SFX_DIR = kit.KIT / "sfx"
# Generic names rotate through takes, so a repeated sound never sounds copy-pasted.
SFX_VARIANTS = {
    "whoosh": ["whoosh-soft", "whoosh-short", "whoosh-medium-1s"],
    "pop": ["pop-1", "pop-2"],
    "click": ["click-soft", "click-mouse", "tap"],
    "paper": ["page-turn", "paper-shuffle"],
}
AUTO_SFX = {"slide": "whoosh", "wipe": "whoosh", "push": "whoosh", "through": "whoosh", "flip": "whoosh"}
_peaks: dict[str, float] = {}


def sfx_peak(path: Path) -> float:
    """Seconds from the start of a sound to its loudest moment (cached)."""
    key = str(path)
    if key not in _peaks:
        import numpy as np
        import soundfile as sf

        data, sr = sf.read(path, always_2d=True)
        env = np.abs(data).max(axis=1)
        _peaks[key] = float(np.argmax(env)) / sr
    return _peaks[key]


def place_sfx(root: Path, placed: list, words: list[dict], fps: int, default_tr: str = "fade") -> list[dict]:
    """Sound effects: per scene {"name", "cue" | "at", "volume"}, plus a whoosh on slide/wipe transitions.

    Mixing rules: a sound's loudest point lands one frame after the picture event (the ear reads that as
    in sync); generic names ("whoosh", "pop", "click", "paper") rotate through takes.
    """
    out, rotation = [], {}
    for idx, (s, start, length, media, mtype, speech) in enumerate(placed):
        wanted = list(s.get("sfx", []))
        tr = s.get("transition", default_tr)
        if idx > 0 and tr in AUTO_SFX and s.get("auto_sfx", True):
            wanted.append({"name": AUTO_SFX[tr], "at": 0.0, "volume": 0.35})
        for fx in wanted:
            name = fx["name"]
            if name in SFX_VARIANTS:
                r = rotation.get(name, 0)
                rotation[name] = r + 1
                fx = {**fx, "name": SFX_VARIANTS[name][r % len(SFX_VARIANTS[name])]}
            if fx.get("cue"):
                t = cue_time(words, fx["cue"], start, start + length) if words else None
                if t is None:
                    kit.log(f"  ! scene '{s['id']}': sfx cue '{fx['cue']}' not heard; skipped")
                    continue
            else:
                t = start + float(fx.get("at", 0))
            src = SFX_DIR / f"{fx['name']}.wav"
            if not src.exists():
                kit.log(f"  ! unknown sfx '{fx['name']}' (see sfx/README.md)")
                continue
            dst = root / "build" / "sfx" / src.name
            kit.copy_if_newer(src, dst)
            t = t - sfx_peak(src) + 1 / fps  # peak one frame after the event
            out.append({"src": rel(dst, root), "frame": max(0, round(t * fps)), "volume": float(fx.get("volume", 0.5))})
    return out


def beat_sync(placed: list, timeline_scenes: list, music: Path, fps: int, window: float = 0.3) -> int:
    """Snap slideshow switches that have no word cue to the nearest beat of the soundtrack (within
    `window` seconds). Narrated scene boundaries never move. Returns how many switches moved."""
    import librosa
    import numpy as np

    y, sr = librosa.load(str(music), sr=22050, mono=True)
    tempo, frames = librosa.beat.beat_track(y=y, sr=sr)
    beats = librosa.frames_to_time(frames, sr=sr)
    if len(beats) < 4:
        kit.log("  ! beat sync: no clear beat in the soundtrack; skipped")
        return 0
    moved = 0
    for s, start, length, media, mtype, speech in placed:
        if mtype != "images":
            continue
        items = s["media"]
        i0 = s["_tl"]
        for k in range(1, len(items)):
            if isinstance(items[k], dict) and items[k].get("cue"):
                continue
            cur = timeline_scenes[i0 + k]["from"] / fps
            near = beats[np.argmin(np.abs(beats - cur))]
            prev_from = timeline_scenes[i0 + k - 1]["from"] / fps
            next_end = (timeline_scenes[i0 + k]["from"] + timeline_scenes[i0 + k]["duration"]) / fps
            if abs(near - cur) <= window and near - prev_from >= 0.6 and next_end - near >= 0.6:
                delta = round(near * fps) - timeline_scenes[i0 + k]["from"]
                timeline_scenes[i0 + k - 1]["duration"] += delta
                timeline_scenes[i0 + k]["from"] += delta
                timeline_scenes[i0 + k]["duration"] -= delta
                moved += 1
    kit.log(f"  beat sync: {moved} switch(es) on the beat (~{float(np.atleast_1d(tempo)[0]):.0f} BPM)")
    return moved


def stage_music(root: Path, gen: dict, total: float, cache: dict) -> Path:
    """Generate the soundtrack with ACE-Step at the video's exact length (cached by prompt + length).

    gen: {"caption": "...", "bpm": 85, "key": "", "seed": 1, "variants": [1, 2, 3], "model": ..., "lm": ...}
    "variants" renders several seeds into build/music/ to compare; "seed" picks the one used.
    """
    ace_py = kit.KIT / "tools" / "ACE-Step-1.5" / ".venv" / "Scripts" / "python.exe"
    if not ace_py.exists():
        raise RuntimeError("ACE-Step is not installed: run `uv sync` in video-kit/tools/ACE-Step-1.5")
    duration = round(total + 1.0, 1)
    seed = int(gen.get("seed", 1))
    seeds = sorted({seed, *[int(x) for x in gen.get("variants", [])]})
    out_dir = root / "build" / "music"
    base = out_dir / "track.wav"
    key = kit.text_hash("ace", gen.get("caption"), gen.get("bpm"), gen.get("key"), duration, gen.get("model"), gen.get("lm"))
    mc = cache.setdefault("music", {})
    missing = [sd for sd in seeds if mc.get(str(sd)) != key or not base.with_name(f"track_s{sd}.wav").exists()]
    if missing:
        kit.log(f"  ace-step: {len(missing)} track(s), {duration:.0f}s")
        job = {"caption": gen["caption"], "duration": duration, "bpm": gen.get("bpm"), "key": gen.get("key", ""),
               "out": str(base), "seeds": missing, "model": gen.get("model", "acestep-v15-turbo"),
               "lm": gen.get("lm", "acestep-5Hz-lm-1.7B"), "thinking": gen.get("thinking", True),
               "steps": gen.get("steps", 8), "fade_in": gen.get("fade_in", 0.5), "fade_out": gen.get("fade_out", 2.5)}
        out_dir.mkdir(parents=True, exist_ok=True)
        jf = out_dir / "job.json"
        jf.write_text(json.dumps(job, indent=1), encoding="utf-8")
        kit.run([str(ace_py), str(Path(__file__).with_name("music_ace.py")), str(jf)], quiet=False)
        for sd in missing:
            mc[str(sd)] = key
    return base.with_name(f"track_s{seed}.wav")


def prep_clip(root: Path, s: dict, src: Path, length: float, fps: int, cache: dict) -> Path:
    """Trim, speed up, conform to fps and pad (freeze last frame) to the scene length."""
    out = root / "build" / "clips" / f"{s['id']}.mp4"
    trim = s.get("trim") or [0, None]
    speed = float(s.get("speed", 1.0))
    key = kit.text_hash("clip", kit.file_hash(src), trim, speed, round(length, 3), fps, s.get("clipVolume", 0))
    cc = cache.setdefault("clips", {})
    if cc.get(s["id"]) == key and out.exists():
        return out
    kit.log(f"  clip: {s['id']} ({src.name}, {speed}x)")
    out.parent.mkdir(parents=True, exist_ok=True)
    cmd = [kit.ffmpeg(), "-y"]
    if trim[0]:
        cmd += ["-ss", str(trim[0])]
    if trim[1] is not None:
        cmd += ["-to", str(trim[1])]
    cmd += ["-i", str(src)]
    vf = f"setpts=PTS/{speed},fps={fps},scale='min(1920,iw)':-2:flags=lanczos,tpad=stop_mode=clone:stop_duration={length + 1:.3f}"
    cmd += ["-vf", vf, "-t", f"{length + 0.5:.3f}", "-c:v", "libx264", "-preset", "fast", "-crf", "18", "-pix_fmt", "yuv420p"]
    if s.get("clipVolume"):
        cmd += ["-af", f"atempo={speed}" if 0.5 <= speed <= 2 else "anull", "-c:a", "aac", "-b:a", "192k"]
    else:
        cmd += ["-an"]
    kit.run(cmd + [str(out)])
    cc[s["id"]] = key
    return out


def clip_length(src: Path, s: dict) -> float:
    total = kit.duration(src)
    a, b = (s.get("trim") or [0, None]) + [None] * (2 - len(s.get("trim") or [0, None]))
    b = total if b is None else min(b, total)
    return max(0.1, (b - (a or 0)) / float(s.get("speed", 1.0)))


# --------------------------------------------------------------------------- build

def build(root: Path, formats: list[str] | None, preview: bool, render: bool, gif: bool) -> None:
    spec_file = root / "script.json"
    if not spec_file.exists():
        raise SystemExit(f"No script.json in {root}")
    spec = with_profile(json.loads(spec_file.read_text(encoding="utf-8")))
    build_dir = root / "build"
    out_dir = root / "out"
    build_dir.mkdir(exist_ok=True)
    out_dir.mkdir(exist_ok=True)
    cache = load_cache(build_dir)

    fps = int(spec.get("fps", 30))
    fade = int(spec.get("fade", 10))
    lead, tail = float(spec.get("lead", 0.25)), float(spec.get("tail", 0.45))
    fmts = formats or spec.get("format", "4x5")
    fmts = [fmts] if isinstance(fmts, str) else list(fmts)
    scenes = spec["scenes"]
    for i, s in enumerate(scenes):
        s.setdefault("id", f"s{i + 1}")

    kit.log(f"[1/5] narration ({spec.get('voice', {}).get('engine', 'kokoro')})")
    voice_clips = stage_voice(root, spec, scenes, cache)
    save_cache(build_dir, cache)

    kit.log("[2/5] media and timing")
    from types_size import SIZES  # noqa: E402

    t = 0.0
    placed = []  # (scene spec, start, length, media path or None, media type)
    for s in scenes:
        speech = kit.duration(voice_clips[s["id"]]) if s["id"] in voice_clips else 0.0
        media, mtype = None, None
        if "manim" in s:
            theme = {"style": spec.get("style", "clean"), "accent": (spec.get("brand") or {}).get("accent")}
            media, mtype = stage_manim(root, s, SIZES[fmts[0]], cache, theme), "video"
            s.setdefault("fit", "cover")
        elif s.get("chat"):
            mtype = "chat"
        elif any(s.get(k) for k in DEV_KINDS):
            mtype = next(k for k in DEV_KINDS if s.get(k))
        elif isinstance(s.get("media"), list):
            # Slideshow: several images share the scene (and its narration) in equal parts.
            # Items are paths or {"src": path, "label": "Cutting plan"}.
            s["_labels"] = [m.get("label") if isinstance(m, dict) else None for m in s["media"]]
            media = [resolve_in(root, m["src"] if isinstance(m, dict) else m) for m in s["media"]]
            for m in media:
                if not m.exists():
                    raise RuntimeError(f"Scene '{s['id']}': media not found: {m}")
                if m.suffix.lower() not in IMAGE_EXT:
                    raise RuntimeError(f"Scene '{s['id']}': a media list takes images only ({m.name})")
            mtype = "images"
        elif s.get("media"):
            media = resolve_in(root, s["media"])
            if not media.exists():
                raise RuntimeError(f"Scene '{s['id']}': media not found: {s['media']}")
            ext = media.suffix.lower()
            mtype = "video" if ext in VIDEO_EXT else "image" if ext in IMAGE_EXT else None
            if not mtype:
                raise RuntimeError(f"Scene '{s['id']}': unsupported media type {ext}")

        # Video scenes last as long as the (trimmed, sped-up) clip or the narration, whichever is longer.
        # Images and cards last as long as the narration, or 3 s when silent.
        if mtype == "video":
            natural = clip_length(media, s)
        elif mtype == "images":
            natural = 0.0 if speech else 2.5 * len(media)
        elif mtype == "chat":
            natural = 0.0 if speech else 2.5 * len(s["chat"].get("messages", []))
        elif mtype in DEV_KINDS:
            natural = dev_natural_length(mtype, s[mtype])
        else:
            natural = 0.0 if speech else 3.0
        if "duration" in s:
            length = float(s["duration"])
        elif s.get("talk"):
            length = max(float(s.get("min", 0)), natural)  # the clip carries its own speech
        else:
            length = max(float(s.get("min", 0)), natural, lead + speech + tail)
        if speech and length < speech + lead:
            kit.log(f"  ! scene '{s['id']}': narration ({speech:.1f}s) longer than duration ({length:.1f}s)")
        placed.append((s, t, length, media, mtype, speech))
        t += length
    total = t

    # Video clips are conformed after timing so they can be padded to the scene length.
    timeline_scenes = []

    def local(path: Path) -> Path:
        """Media must sit inside the project folder (Remotion's public dir): copy it in if not."""
        if str(path).startswith(str(root)):
            return path
        dst = build_dir / "media" / path.name
        kit.copy_if_newer(path, dst)
        return dst

    default_transition = spec.get("transition", "fade")
    for s, start, length, media, mtype, speech in placed:
        s["_tl"] = len(timeline_scenes)  # index of this scene's first timeline entry
        if mtype == "images":
            n = len(media)
            motions = ["zoom-in", "pan-right", "zoom-out", "pan-left"]
            for k, m in enumerate(media):
                a, b = start + length * k / n, start + length * (k + 1) / n
                sub = {"id": f"{s['id']}_{k + 1}", "kind": "media", "from": round(a * fps), "duration": round(b * fps) - round(a * fps),
                       "media": rel(local(m), root), "mediaType": "image", "motion": s.get("motion", motions[k % len(motions)])}
                if "fit" in s:
                    sub["fit"] = s["fit"]
                for key in ("headline", "sub", "badge"):
                    if s.get(key) and (k == 0 or s.get("keep_headline")):
                        sub[key] = s[key]
                if s["_labels"][k]:
                    sub["label"] = s["_labels"][k]
                if s.get("captions") is False:
                    sub["hideCaptions"] = True
                timeline_scenes.append(sub)
            continue
        f0, nf = round(start * fps), round((start + length) * fps) - round(start * fps)
        if mtype in DEV_KINDS:
            sc = {"id": s["id"], "kind": "title" if mtype == "kinetic" else mtype, "from": f0, "duration": nf,
                  **dev_scene_data(root, mtype, s, local)}
            if mtype == "terminal" and s.get("auto_sfx", True):
                dst = build_dir / "sfx" / "keyboard-typing-1s.wav"
                kit.copy_if_newer(SFX_DIR / "keyboard-typing-1s.wav", dst)
                sc["sfxType"] = rel(dst, root)
            for k in ("headline", "sub", "label", "badge"):
                if s.get(k):
                    sc[k] = s[k]
            if s.get("captions") is False:
                sc["hideCaptions"] = True
            timeline_scenes.append(sc)
            continue
        if mtype == "chat":
            msgs = []
            for m in s["chat"].get("messages", []):
                mm = {"role": m.get("role", "user"), "text": m["text"]}
                if m.get("images"):
                    mm["images"] = [rel(local(resolve_in(root, p)), root) for p in m["images"]]
                msgs.append(mm)
            sc = {"id": s["id"], "kind": "chat", "from": f0, "duration": nf, "messages": msgs}
            if s["chat"].get("title"):
                sc["chatTitle"] = s["chat"]["title"]
            if s.get("auto_sfx", True):
                for key, name in (("sfxType", "keyboard-typing-1s"), ("sfxReply", "pop-1")):
                    dst = build_dir / "sfx" / f"{name}.wav"
                    kit.copy_if_newer(SFX_DIR / f"{name}.wav", dst)
                    sc[key] = rel(dst, root)
            if s.get("captions") is False:
                sc["hideCaptions"] = True
            timeline_scenes.append(sc)
            continue
        sc = {"id": s["id"], "kind": "card" if s.get("card") else "media", "from": f0, "duration": nf}
        if s.get("card"):
            sc.update({k: s["card"].get(k) for k in ("title", "subtitle", "footer") if s["card"].get(k)})
        elif media is not None:
            if mtype == "video":
                media = prep_clip(root, s, media, length + fade / fps, fps, cache)
            else:
                media = local(media)
            sc.update({"media": rel(media, root), "mediaType": mtype})
            for k in ("fit", "motion", "clipVolume"):
                if k in s:
                    sc[k] = s[k]
            if s.get("zoom") or s.get("clicks") or s.get("events"):
                st = next(x for x in kit.probe(media)["streams"] if x.get("width"))
                sc["aspect"] = st["width"] / st["height"]
        for k in ("headline", "sub", "label", "badge"):
            if s.get(k):
                sc[k] = s[k]
        if s.get("captions") is False:
            sc["hideCaptions"] = True
        timeline_scenes.append(sc)

    # Transitions: the scene's own (or the video default) into its first entry; slideshow items
    # change with "item_transition" (default fade). "cut" also stops the previous scene's overlap.
    for s, *_ in placed:
        i0 = s["_tl"]
        n = len(s["_labels"]) if "_labels" in s else 1
        timeline_scenes[i0]["transition"] = s.get("transition", default_transition)
        for j in range(1, n):
            timeline_scenes[i0 + j]["transition"] = s.get("item_transition", "fade")
    save_cache(build_dir, cache)

    timeline = {
        "fps": fps,
        "style": spec.get("style", "clean"),
        "durationInFrames": round(total * fps),
        "fade": fade,
        "scenes": timeline_scenes,
    }
    if spec.get("brand"):
        timeline["brand"] = {k: v for k, v in spec["brand"].items() if k != "logo"}
        logo = spec["brand"].get("logo")
        if logo:
            lp = resolve_in(root, logo)
            if lp.exists():
                timeline["logo"] = rel(local(lp), root)
    for key in ("background", "perspective"):
        if key in spec:
            timeline[key] = spec[key]
        for s_, *_ in placed:
            if key in s_:
                timeline_scenes[s_["_tl"]][key] = s_[key]
    if spec.get("film"):
        timeline["film"] = spec["film"] if isinstance(spec["film"], dict) else {"grain": 0.06, "vignette": 0.35}
    if spec.get("caption_style"):
        timeline["captionStyle"] = spec["caption_style"]
    for s, *_ in placed:
        if s.get("leak") is not None and s.get("leak") is not False:
            timeline_scenes[s["_tl"]]["leak"] = s["leak"] if isinstance(s["leak"], dict) else {}

    kit.log("[3/5] voice track and captions")
    if voice_clips:
        import voice as voice_mod

        starts = {s["id"]: start for s, start, *_ in placed}
        talk_ids = {s["id"] for s in scenes if s.get("talk")}
        offset = {sid: (0.0 if sid in talk_ids else lead) for sid in voice_clips}  # a talking clip speaks from its first frame
        track_clips = [(starts[sid] + offset[sid], p) for sid, p in voice_clips.items()]
        vkey = kit.text_hash("mix", [(round(a, 3), kit.file_hash(p)) for a, p in track_clips], round(total, 3))
        vfile = build_dir / "voice.wav"
        if cache.get("mix") != vkey or not vfile.exists():
            voice_mod.mixdown(track_clips, total, vfile)
            cache["mix"] = vkey
        timeline["voice"] = rel(vfile, root)
        timeline["speech"] = [
            [int((starts[sid] + offset[sid]) * 1000), int((starts[sid] + offset[sid] + kit.duration(p)) * 1000)] for sid, p in voice_clips.items()
        ]

        if spec.get("captions", True):
            import captions as cap

            engine = (spec.get("voice") or {}).get("engine", "kokoro")
            script_text = " ".join((s.get("say") or "").strip() for s in scenes if s["id"] in voice_clips)
            ckey = kit.text_hash("cap", vkey, script_text, spec.get("language", "en"), spec.get("whisper", "turbo"))
            cfile = build_dir / "words.json"
            if cache.get("captions") != ckey or not cfile.exists():
                kit.log("  whisper: transcribing narration")
                words = cap.transcribe(vfile, spec.get("language", "en"), script_text, spec.get("whisper", "turbo"))
                if spec.get("align", engine != "recorded" and not talk_ids):
                    words = cap.align(words, script_text)
                cfile.write_text(json.dumps(words, indent=1, ensure_ascii=False), encoding="utf-8")
                cache["captions"] = ckey
            words = json.loads(cfile.read_text(encoding="utf-8"))
            timeline["captions"] = cap.to_remotion(words)
            (out_dir / f"{root.name}.srt").write_text(cap.to_srt(words), encoding="utf-8")
    save_cache(build_dir, cache)

    spoken_words = json.loads((build_dir / "words.json").read_text(encoding="utf-8")) if (voice_clips and (build_dir / "words.json").exists()) else []
    sync_slideshows(placed, timeline_scenes, spoken_words, fps)
    time_dev_scenes(placed, timeline_scenes, spoken_words, fps)
    time_screen_polish(root, placed, timeline_scenes, spoken_words, fps)
    time_overlays(placed, timeline_scenes, spoken_words, fps)
    sfx = place_sfx(root, placed, spoken_words, fps, spec.get("transition", "fade"))
    if sfx:
        timeline["sfx"] = sfx

    music = spec.get("music")
    if music and music.get("generate"):
        dst = stage_music(root, music["generate"], total, cache)
        save_cache(build_dir, cache)
        timeline["music"] = {"src": rel(dst, root), "volume": float(music.get("volume", 0.22)), "duck": float(music.get("duck", 0.07))}
    elif music and music.get("file"):
        src = resolve_in(root, music["file"])
        if not src.exists():
            raise RuntimeError(f"Music not found: {music['file']}")
        dst = build_dir / f"music{src.suffix.lower()}"
        kit.copy_if_newer(src, dst)
        timeline["music"] = {"src": rel(dst, root), "volume": float(music.get("volume", 0.22)), "duck": float(music.get("duck", 0.07))}
    if spec.get("beat_sync") and timeline.get("music"):
        beat_sync(placed, timeline_scenes, root / timeline["music"]["src"], fps)

    kit.log(f"[4/5] timeline: {len(timeline_scenes)} scenes, {total:.1f}s")
    if spec.get("target") and total > float(spec["target"]) * 1.05:
        kit.log(f"  ! {total:.0f}s is over the {spec['target']}s target by {total - float(spec['target']):.0f}s (vk check shows where)")
    for s, start, length, *_ in placed:
        kit.log(f"  {start:6.2f}s  {length:5.2f}s  {s['id']}")

    if not render:
        for fmt in fmts:
            (build_dir / f"timeline-{fmt}.json").write_text(json.dumps(for_format(timeline, fmt), indent=1, ensure_ascii=False), encoding="utf-8")
        return

    kit.log("[5/5] render")
    for fmt in fmts:
        props = build_dir / f"timeline-{fmt}.json"
        props.write_text(json.dumps(for_format(timeline, fmt), indent=1, ensure_ascii=False), encoding="utf-8")
        suffix = "-preview" if preview else ""
        out = out_dir / f"{root.name}-{fmt}{suffix}.mp4"
        render_remotion(root, props, out, preview)
        kit.log(f"  -> {out}")
        cover_frame = cover_at(spec, placed, fps)
        cover = out_dir / f"{root.name}-{fmt}-cover.png"
        cover_props = build_dir / f"timeline-{fmt}-cover.json"
        cover_props.write_text(json.dumps({**for_format(timeline, fmt), "noCaptions": True}, ensure_ascii=False), encoding="utf-8")
        still(root, cover_props, cover, cover_frame)
        kit.log(f"  -> {cover}")
        if gif:
            g = out_dir / f"{root.name}-{fmt}.gif"
            kit.run([kit.which_remotion(), "render", "src/index.ts", "Main", str(g), f"--props={props}", f"--public-dir={root}",
                     "--codec=gif", "--every-nth-frame=3", "--scale=0.5", "--log=error"], cwd=kit.REMOTION, quiet=False)
            kit.log(f"  -> {g}")


def cover_at(spec: dict, placed: list, fps: int) -> int:
    for s, start, length, *_ in placed:
        if s.get("cover"):
            if not isinstance(s["cover"], bool):
                return round((start + float(s["cover"])) * fps)  # seconds into the scene
            if s.get("kinetic"):  # once every word and mark has landed, before the words leave
                return round((start + max(0.5, min(length * 0.75, length - 0.6))) * fps)
            return round((start + min(length * 0.6, 2.0)) * fps)
    s, start, length, *_ = placed[0]
    return round((start + min(length * 0.6, 1.5)) * fps)


def render_remotion(root: Path, props: Path, out: Path, preview: bool) -> None:
    cmd = [kit.which_remotion(), "render", "src/index.ts", "Main", str(out), f"--props={props}", f"--public-dir={root}", "--log=error"]
    if preview:
        cmd.append("--scale=0.5")
    kit.run(cmd, cwd=kit.REMOTION, quiet=False)
    master_audio(out)


def master_audio(video: Path, target: float = -14.0) -> None:
    """Final loudness for social feeds (~-14 LUFS, true peak -1.5 dB); the picture is copied untouched."""
    tmp = video.with_name(video.stem + "_master.mp4")
    kit.run([kit.ffmpeg(), "-y", "-i", str(video), "-c:v", "copy", "-af", f"loudnorm=I={target}:TP=-1.5:LRA=11",
             "-ar", "48000", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", str(tmp)])
    tmp.replace(video)


def grid_overlay(png: Path) -> Path:
    """Copy of a still with a labelled 10% grid, to read the x, y, w, h fractions for camera and annotate."""
    from PIL import Image, ImageDraw, ImageFont

    im = Image.open(png).convert("RGB")
    W, H = im.size
    d = ImageDraw.Draw(im)
    font = ImageFont.load_default(size=max(16, min(W, H) // 45))
    for i in range(1, 10):
        x, y = W * i // 10, H * i // 10
        strong = i == 5
        d.line([(x, 0), (x, H)], fill=(255, 0, 170) if strong else (0, 230, 255), width=3 if strong else 1)
        d.line([(0, y), (W, y)], fill=(255, 0, 170) if strong else (0, 230, 255), width=3 if strong else 1)
        d.text((x + 6, 6), f"{i / 10:.1f}", fill=(0, 230, 255), font=font, stroke_width=2, stroke_fill=(0, 0, 0))
        d.text((6, y + 6), f"{i / 10:.1f}", fill=(0, 230, 255), font=font, stroke_width=2, stroke_fill=(0, 0, 0))
    out = png.with_name(png.stem + "-grid.png")
    im.save(out)
    return out


def still(root: Path, props: Path, out: Path, frame: int) -> None:
    kit.run([kit.which_remotion(), "still", "src/index.ts", "Main", str(out), f"--props={props}", f"--public-dir={root}",
             f"--frame={frame}", "--log=error"], cwd=kit.REMOTION, quiet=False)


# --------------------------------------------------------------------------- review

# Measured on the cloned voice (incl. short pauses): English ~2.5 words/s, Portuguese ~2.05.
WORDS_PER_SECOND = {"en": 2.5, "pt": 2.05}


def check(root: Path) -> None:
    """Pre-flight: every media file exists, narration length per scene and in total vs "target"."""
    spec = with_profile(json.loads((root / "script.json").read_text(encoding="utf-8")))
    lead, tail = float(spec.get("lead", 0.25)), float(spec.get("tail", 0.45))
    wps = WORDS_PER_SECOND.get(spec.get("language", "en"), 2.3)
    problems, total = [], 0.0
    print(f"{'scene':<14}{'words':>6}{'~sec':>7}  media")
    for i, s in enumerate(spec["scenes"]):
        sid = s.get("id", f"s{i + 1}")
        words = len((s.get("say") or "").split())
        est = words / wps + (lead + tail if words else 0)
        items = s.get("media") if isinstance(s.get("media"), list) else ([s["media"]] if s.get("media") else [])
        items += [img for m in (s.get("chat") or {}).get("messages", []) for img in m.get("images", [])]
        missing = []
        for m in items:
            ref = m["src"] if isinstance(m, dict) else m
            path, _, _ = ref.partition("#") if ref.lower().split("#")[0].endswith(".pdf") else (ref, "", "")
            p = Path(path) if Path(path).is_absolute() else root / path
            if not p.exists() and not (kit.KIT / path).exists():
                missing.append(Path(path).name)
        if "duration" in s:
            est = float(s["duration"])
        est = max(est, float(s.get("min", 0)))
        total += est
        note = f"MISSING: {', '.join(missing)}" if missing else f"{len(items)} file(s)" if items else ("card" if s.get("card") else "chat" if s.get("chat") else "")
        print(f"{sid:<14}{words:>6}{est:>7.1f}  {note}")
        problems += [f"{sid}: {m}" for m in missing]
    print(f"\nestimated length (narration only; video clips may add): {total:.0f}s", end="")
    target = spec.get("target")
    if target:
        diff = total - float(target)
        print(f"   target {target}s  ->  {'OVER by' if diff > 0 else 'under by'} {abs(diff):.0f}s")
        if diff > 0:
            need = diff * wps
            print(f"   cut about {need:.0f} words of narration, or shorten silent clips")
    else:
        print('   (no "target" set)')
    if problems:
        raise SystemExit(f"\n{len(problems)} missing file(s)")


def sheet(root: Path, fmt: str | None, every: float, preview: bool) -> Path:
    """Frames every N seconds tiled into one PNG, for a scene-by-scene review."""
    if not fmt:
        spec = json.loads((root / "script.json").read_text(encoding="utf-8"))
        f = spec.get("format", "4x5")
        fmt = f if isinstance(f, str) else f[0]
    video = root / "out" / f"{root.name}-{fmt}{'-preview' if preview else ''}.mp4"
    if not video.exists():
        raise SystemExit(f"Not rendered yet: {video.name}")
    n = max(1, int(kit.duration(video) // every))
    cols = 8 if fmt in ("9x16",) else 6
    rows = -(-n // cols)
    width = 180 if fmt == "9x16" else 240
    out = root / "out" / f"{root.name}-{fmt}-sheet.png"
    vf = f"fps=1/{every},scale={width}:-1,drawtext=text='%{{pts\\:hms}}':x=6:y=6:fontsize=14:fontcolor=white:box=1:boxcolor=black@0.6,tile={cols}x{rows}"
    kit.run([kit.ffmpeg(), "-y", "-i", str(video), "-vf", vf, "-frames:v", "1", str(out)])
    return out


# --------------------------------------------------------------------------- cli

def main() -> None:
    if len(sys.argv) > 1 and sys.argv[1] in ("cut", "transcribe", "capture"):
        import media_tools

        media_tools.main(sys.argv[1:])
        return
    ap = argparse.ArgumentParser(prog="vk", description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    b = sub.add_parser("build")
    b.add_argument("project")
    b.add_argument("--format")
    b.add_argument("--preview", action="store_true")
    b.add_argument("--no-render", action="store_true")
    b.add_argument("--gif", action="store_true")
    b.add_argument("--placeholders", action="store_true", help="draft: grey cards for media not provided yet")
    st = sub.add_parser("still")
    st.add_argument("project")
    st.add_argument("--frame", type=int)
    st.add_argument("--at", type=float)
    st.add_argument("--format")
    st.add_argument("--grid", action="store_true", help="overlay a 10%% grid to read x, y for camera / annotate")
    n = sub.add_parser("new")
    n.add_argument("project")
    so = sub.add_parser("studio")
    so.add_argument("project")
    so.add_argument("--format")
    sub.add_parser("voices")
    sh = sub.add_parser("sheet", help="contact sheet of a rendered video, to review every scene")
    sh.add_argument("project")
    sh.add_argument("--format")
    sh.add_argument("--every", type=float, default=2.0, help="seconds between frames")
    sh.add_argument("--preview", action="store_true", help="use the -preview render")
    ck = sub.add_parser("check", help="before generating anything: missing media, word count, estimated length")
    ck.add_argument("project")
    q = sub.add_parser("qa", help="automated checks on a rendered video: speech, pace, loudness, black/frozen frames, length")
    q.add_argument("project")
    q.add_argument("--format")
    q.add_argument("--preview", action="store_true")
    vs = sub.add_parser("voice-setup", help="turn recordings in user/voices/raw/ into voice-clone samples and tones")
    vs.add_argument("--speaker")
    vs.add_argument("--dry-run", action="store_true")
    vs.add_argument("--redo", nargs="*", metavar="TONE", help="redo tones already set up (all, or only the ones named)")
    a = ap.parse_args()

    if a.cmd == "voices":
        print(VOICES)
        return
    if a.cmd == "voice-setup":
        import voice_setup

        sys.argv = ["vk voice-setup"] + (["--speaker", a.speaker] if a.speaker else []) + (["--dry-run"] if a.dry_run else [])
        if a.redo is not None:
            sys.argv += ["--redo"] + a.redo
        voice_setup.main()
        return
    root = project_dir(a.project)

    if a.cmd == "check":
        check(root)
        return
    if a.cmd == "qa":
        import qa

        sys.exit(qa.run_qa(root, a.format, a.preview))
    if a.cmd == "sheet":
        print(sheet(root, a.format, a.every, a.preview))
        return

    if a.cmd == "new":
        if root.exists():
            raise SystemExit(f"Already exists: {root}")
        for d in ("assets", "audio/rec", "manim"):
            (root / d).mkdir(parents=True)
        shutil.copy2(TEMPLATE, root / "script.json")
        print(f"Created {root}\nEdit script.json, put media in assets/, then: vk build {root.name} --preview")
        return

    if a.cmd == "build":
        if a.placeholders:
            os.environ["VK_PLACEHOLDERS"] = "1"
        build(root, a.format.split(",") if a.format else None, a.preview, not a.no_render, a.gif)
        return

    fmt = a.format
    if not fmt:
        spec = json.loads((root / "script.json").read_text(encoding="utf-8"))
        f = spec.get("format", "4x5")
        fmt = f if isinstance(f, str) else f[0]
    props = root / "build" / f"timeline-{fmt}.json"
    if not props.exists():
        build(root, [fmt], False, False, False)

    if a.cmd == "still":
        tl = json.loads(props.read_text(encoding="utf-8"))
        frame = a.frame if a.frame is not None else round((a.at or 0) * tl["fps"])
        out = root / "out" / f"still-{fmt}-{frame}.png"
        still(root, props, out, frame)
        if a.grid:
            out = grid_overlay(out)
        print(out)
    elif a.cmd == "studio":
        subprocess.run([kit.which_remotion(), "studio", "src/index.ts", f"--props={props}", f"--public-dir={root}"], cwd=kit.REMOTION)


VOICES = """Kokoro voices (first letter = accent: a = American, b = British). Grade = overall grade in
the Kokoro model card (hexgrad/Kokoro-82M, VOICES.md).
  American female: af_heart (A), af_bella (A-), af_nicole (B-), af_aoede, af_kore, af_sarah (C+)
  American male:   am_michael, am_fenrir, am_puck (C+)  - the best male voices; others are D or lower
  British female:  bf_emma (B-), bf_isabella (C)
  British male:    bm_george, bm_fable (C)
For a voice that sounds like you, clone your own with the qwen engine (docs/voice.md)."""


if __name__ == "__main__":
    main()
