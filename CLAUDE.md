# video-kit

Turns a `script.json` into a finished, narrated, captioned video, locally and for free. Built to be
driven by Claude Code; every step is also a plain command (`vk ...`).

**First run:** if `user/profile.json` does not exist, use the `kit-setup` skill before anything else.
**Making a video:** use the `video-kit` skill (script first, approval, then render).

Talk to the person in their language. Video content language comes from the script (`"language"`).

## Principles

- The kit **assembles** material the project provides (photos, recordings, renders, PDFs, code, data). It
  does not invent footage, and project-specific generators (CAD renders, 3D, etc.) belong to the project.
- Everything personal lives in `user/` (git-ignored): profile, brand, voice samples, music, notes.
  Never copy anything from `user/` or real `projects/` into versioned files.
- Script before production: discuss and get approval before generating narration or rendering.
- Facts and claims come from sources (README, code, the person); every image matches the line over it.

## Layout

```
vk.cmd                    entry point (uses py/main's Python)
setup.ps1                 install / -Check (read-only)
pipeline/build.py         build, check, sheet, still, studio, qa, voice-setup (cache: redoes only what changed)
pipeline/voice.py         Kokoro, Qwen3-TTS clone (tts_qwen.py in py/qwen), own takes + cleanup, mixdown/loudnorm
pipeline/captions.py      Whisper word timings, aligned to the script spelling, SRT
pipeline/devscenes.py     code highlighting (Pygments), diffs, git history, diagram layout
pipeline/media_tools.py   vk cut / transcribe / capture
pipeline/music_ace.py     ACE-Step soundtrack generation (runs in its own venv)
pipeline/qa.py            vk qa
pipeline/voice_setup.py   vk voice-setup
pipeline/vk_manim.py      helper for Manim scenes
remotion/src/             templates: Main, Captions, styles, scenes/*
sfx/                      CC0 sound effects (sources in LICENSES-source.md)
docs/                     checklist, lessons, voice guide
user.example/             template for user/
projects/example*/        versioned examples; other projects stay local
```

## Commands

```
vk new <p>                      project from the template
vk check <p>                    missing media, words, estimated length vs "target"
vk build <p> [--preview] [--format 4x5,9x16] [--placeholders] [--gif] [--no-render]
vk sheet <p> [--preview] [--every 2]     contact sheet with timestamps: read it before delivering
vk qa <p> [--preview]           speech match, pace, loudness, black/frozen frames, still picture, length
vk still <p> --at 12.5 | --frame N [--grid]
vk studio <p>                   Remotion Studio with this project's timeline
vk voices                       Kokoro voices
vk voice-setup [--dry-run] [--redo [tone ...]]   recordings in user/voices/raw/ -> clone samples + tones (skips tones already set up)
vk cut <video> [--punch]        remove silences from a talking-head take
vk transcribe <video>           transcript with timestamps (pick segments for shorts)
vk capture <steps.json>         record a scripted browser session + click events (web demos)
```

## script.json

Top level (the person's `user/profile.json` fills brand, voice, language and style when omitted):

```jsonc
{
  "format": ["4x5", "9x16"],        // 1x1, 4x5, 9x16, 16x9
  "style": "clean",                 // clean | bold | tech | midnight | editorial  (remotion/src/styles.ts)
  "target": 60,                     // seconds; vk check / build warn when over
  "language": "en",                 // narration + captions (qwen: en, pt, es, fr, de, it, ru, ja, ko, zh)
  "brand": { "accent": "#F5A524", "handle": "Your Name", "logo": "brand/logo.svg" },
  "voice": { "engine": "kokoro", "voice": "am_michael", "speed": 1.0 },
  //   { "engine": "qwen", "tone": "narracao" }   your cloned voice; tones in user/voices/tones.json
  //        ({"ref", "text" = what the sample says, "temperature"?}); "<tone>_<lang>" preferred for that language
  //   { "engine": "recorded", "clean": true }          your takes: audio/rec/<scene id>.wav
  //   { "engine": "none" }
  "pronounce": { "FreeCAD": "Free CAD" },   // changes what is spoken, not the caption spelling
  "captions": true,
  "caption_style": "pop",          // box | plain | pill | pop (default: the style's own)
  "music": { "generate": { "caption": "warm acoustic ... no vocals", "bpm": 85, "seed": 1, "variants": [2, 3] },
             "volume": 0.18, "duck": 0.06 },
  //   or { "file": "music/track.mp3", ... }   (user/music/ or the project)
  "beat_sync": true,               // slideshow switches without a cue snap to the beat
  "film": { "grain": 0.06, "vignette": 0.35 },
  "transition": "fade",            // default for every scene: fade | slide | wipe | zoom | cut | push | through | flip
                                   // (push, through and flip move both scenes: a camera pan, a fly-through, a card flip)
  "perspective": true,             // terminal and code windows float in 3D (per scene too)
  "background": "grid",            // living backdrop behind non-media scenes: plain | glow | grid | dots (default: the style's; per scene too)
  "lead": 0.25, "tail": 0.45, "fade": 10,
  "scenes": [ ... ]
}
```

Every scene: `id`, `say` (narration), `voice` (tone name or object), `min` / `duration`, `transition`,
`headline` / `sub`, `label`, `badge`, `captions: false`, `sfx: [{"name", "cue"|"at", "volume"}]`,
`leak: {}` (light leak over the cut), `cover: true` (cover frame; or seconds into the scene, e.g. `cover: 3.5`).
Any scene also takes `camera: [{cue|at, x, y, scale, hold}]` (punch-in that snaps and settles on a point;
`hold` = seconds before easing back out) and `annotate: [{cue|at, type: circle/underline/box/strike/arrow/highlight,
x, y, w, h, color, hold}]` (hand-drawn marks; arrow runs from x, y by w, h). Positions are fractions of the frame:
read them from `vk still <p> --at T --grid`; with several formats, add `"format": "4x5"` to an item to
limit it to that format. In a slideshow they land on the image on screen at that moment.

| scene | keys |
|---|---|
| media | `media` (image/video/`file.pdf#3`), `fit` contain/cover, `motion` zoom-in/zoom-out/pan-left/pan-right/none, `trim [a,b]`, `speed`, `clipVolume` |
| slideshow | `media: [path or {"src", "label", "cue"}]`, `item_transition`, `keep_headline` |
| screen demo | media video + `events` (from vk capture) or `zoom: [{at/cue, x, y, scale, hold}]`, `clicks: [{at/cue, x, y}]`, `auto_zoom`, `zoom_scale` |
| talking head | media video + `talk: true` (its audio is the narration; captions from it) |
| card | `card: {title, subtitle, footer}` |
| kinetic title | `kinetic: {text ("\n" for lines), mark: [words], sub, logo, align, media (image/clip behind), motion: rise/blur, exit: false}`: words rise out of their line on an uneven rhythm, slow push-in, leave before the cut |
| chat | `chat: {title, messages: [{role: user/assistant, text, images}]}` |
| terminal | `terminal: {title, prompt, lines: [...]}`; a line is `{cmd}`, `{out, color: green/red/yellow/blue/dim}`, `{stream: [many lines], for: 2}` (a log that races then settles) or `{out: "{n} passed", count: 242}` (rolling number); any line may take `cue`/`at`. Text starts at the top and scrolls; commands are typed with a human rhythm |
| stats | `stats: {title, items: [{value, label, prefix, suffix, decimals, bar (0..1), from, cue/at}]}`: big odometer counters that land with an accent underline |
| code | `code: {file or text, lang, lines [a,b], title, focus: [{lines: [a,b], cue/at}]}` |
| diff | `code: {before, after, title, turn: {cue/at}}` |
| diagram | `diagram: {title, nodes: [{id, label, sub, icon, accent, level?, x?, y?}], edges: [{from, to, label}], flows: [{path: [...], cue/at, color}], vertical?, ambient?}` (portrait formats go top-to-bottom). Runs like a live system: small packets keep moving on every edge and the entry nodes pulse (`ambient: false` to stop); cued flows send a bright packet that bumps each node it reaches |
| git history | `git: {repo, since, until, path, highlights: 4, pick: ["text"], title}` |
| 3D model | `model: {src: "x.glb", az, el, spin (turns), zoom, edges, colors: {part: hex}, explode: {cue/at, amount, hold}, labels: [{part, text, cue/at, hold}], highlight: [{part, cue/at, hold, color}]}`: turntable, exploded view (the camera pulls back to keep it in frame), labels on leader lines that follow their parts, parts tinted on a word. Parts are the .glb's named nodes (a FreeCAD/Blender export names them) |
| manim | `manim: "manim/file.py:SceneClass"` (use `vk_manim.fit_frame()` and `content_area()`) |

Timing: a scene lasts the longest of `min`, its clip (after trim/speed) and its narration + lead + tail.
`cue` = a word in that scene's narration (Whisper timing); `at` = seconds from the scene start.
Paths: relative to the project, the kit root or `user/`; absolute paths are copied in.

## Before delivering

`vk build --preview` → `vk sheet --preview` (read it scene by scene) → read `out/<p>.srt` → final
`vk build` → `vk qa`. Deliverables in `out/`: MP4 per format, `-cover.png`, `.srt`. Checklist:
`docs/checklist.md`. Pitfalls and their fixes: `docs/lessons.md`.

## Extending

New scene: component in `remotion/src/scenes/`, type in `types.ts`, case in `Main.tsx`, data in
`pipeline/build.py` (`dev_scene_data` for data-driven scenes), example in `projects/example*`, docs here.
Type-check with `npx tsc --noEmit` in `remotion/`. New style: `styles.ts` + `vk_manim.py` THEMES.
