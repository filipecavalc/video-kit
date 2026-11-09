# Changelog

## 0.6.3 (2026-11-09)

- README shows what the kit makes: an animated montage, a script.json scene next to the scene it renders,
  a gallery with a clip of every scene type, and the same frame in 16:9 and 4:5. The clips are animated
  WebP in `docs/media/` (about 3 MB), cut from `projects/example-dev`.

## 0.6.2 (2026-11-09)

Fixes from a review of the public repository, for people installing it from scratch.

- Setup: `user/profile.json` is written without a BOM (Windows PowerShell 5.1 added one, and every `vk`
  command then failed to read it); JSON files are read BOM-tolerant anyway. Fetching ACE-Step no longer
  aborts setup when git writes progress to stderr. Python 3.12 is found with the `py` launcher (python.org
  installs it under `%LOCALAPPDATA%`). Node.js 20+ is checked. Playwright's Chromium is installed into
  `tools/playwright` for `vk capture`. `-Check` reports the 3D packages, fonts and the browser.
- Music generation that is not available (no ACE-Step, or no NVIDIA GPU) no longer stops the build: it uses
  `music.file` when the script gives one, otherwise it renders without music, with a note. The examples
  now render on any machine.
- A git history scene without history to read (a downloaded zip has no `.git`) becomes a title instead of
  failing the build.
- `vk check` looks for every file the build reads (kinetic media and logos, 3D models, code files, events,
  Manim files, music files, files in `user/`) and says when music generation is not available.
- Docs: Windows 10/11 only, said plainly; `.k` in PowerShell; "on your own machine, with no paid APIs"
  instead of "for free", with what setup downloads; which keys apply to which scenes (`headline` only over
  media, chips not on cards or chat); undocumented keys documented (`fps`, `whisper`, `align`, `auto_sfx`,
  `leak.hue`, the `music.generate` options); full `vk --help`; transitions list; Manim renders at the
  first format's size. LICENSE is the plain MIT text (GitHub detects it); the notes moved to a README
  section, with the missing credits (PyMuPDF, AGPL-3.0; three.js and React Three Fiber; the fonts; the
  sounds generated upstream) and the origin of the example assets. `sfx/LICENSES-source.md` says what it
  is: the upstream library's review, of which 20 sounds ship here.
- Examples say only what is true (four scenes, the real `vk qa` line, languages with the cloned voice).
- Terminal lines wrap between words instead of inside them.
- Versions in `package.json` and `pyproject.toml` follow the changelog.

## 0.6.1 (2026-11-09)

- Diagram nodes are as wide as their text (one line each, within the room their row leaves); text that
  still does not fit shrinks instead of wrapping.
- Cover frames: a kinetic title is captured after its words and marks have landed; `cover` also takes the
  seconds into the scene (`"cover": 3.5`).

## 0.6.0 (2026-11-09)

- Terminal scene rebuilt: text starts at the top and scrolls when full (no more empty window above two
  lines), commands are typed with an uneven human rhythm (caret solid while typing, blinking after),
  `{"stream": [...], "for": 2}` prints a long log that starts slow, races and settles, `{"out": "{n} passed",
  "count": 242}` rolls the number up like an odometer, the prompt comes back at the end, and any line can be
  placed on a spoken word (`cue`) or a time (`at`).
- New `stats` scene: big counters that slide in, roll up, land with a small pop and an accent underline,
  optional progress bar; several items arrive on an uneven stagger, or each on its own `cue`.
- `camera` on any scene: a punch-in on a point that snaps most of the way in two frames and settles
  (zoom in log scale), optionally easing back out after `hold`; at a spoken word or a time.
- `annotate` on any scene: hand-drawn circle, underline, box, strike, arrow and marker highlight, drawn at a
  spoken word, zooming with the camera. `vk still --grid` overlays a labelled 10% grid to read positions.
- Living backgrounds behind titles, cards, windows, stats, diagrams, chat and git scenes: drifting light,
  plus a technical grid (tech) or dot matrix (midnight) with a few cells catching the light. On the video's
  clock, so cross-fades are seamless. `"background": "plain" | "glow" | "grid" | "dots"` for the video or a scene.
- Kinetic titles: words rise out of their own line on an uneven rhythm with a slight tilt, the block keeps a
  slow push-in, and words leave upward just before the cut (`exit: false` to keep them); `media` puts the title
  over a darkened, slowly zooming image or clip; `motion: "blur"` keeps the previous blur-in.
- `vk qa` checks the visual pace above the captions: a picture frozen for 2.5 s or more is a warning, long
  stretches where only small things move are listed, with the scene names.
- The video-kit skill plans the visuals sentence by sentence (something new every 1.5-3.5 s, the thing named
  on screen within about 1.5 s of the word) with a table of which scene or effect fits which kind of sentence.
- Diagrams run like a live system: small packets keep travelling every edge on their own rhythm, entry
  nodes pulse every few seconds, cued packets follow the curves with a trail and bump the node they reach.
- Transitions that move both scenes: `push` (camera pan), `through` (fly through the old scene into the
  new one) and `flip` (card flip), with a touch of motion blur and a whoosh.
- `"perspective": true` (video or scene): terminal and code windows arrive from depth at an angle and keep
  turning slowly.
- New `model` scene (three.js through `@remotion/three`): a .glb on a slow turntable with dark outline edges,
  an exploded view that lifts the parts apart on a stagger, breathes and comes back together while the camera
  pulls back, labels on leader lines that follow their parts, and parts tinted on a spoken word. New
  dependencies: `@remotion/three`, `three`, `@react-three/fiber` (run `npm install` in `remotion/`).
- Shared motion helpers (`remotion/src/scenes/motion.ts`): easing, uneven staggers, deterministic jitter.
- Clone voice: the build warns when a voice sample ends mid-speech (its last word leaks into every line).

## 0.5.0 (2026-11-08)

- Voice cloning: **Qwen3-TTS** (1.7B Base, Apache-2.0) replaces Chatterbox, in its own venv `py/qwen`.
  Much better Portuguese (Chatterbox's multilingual model mangled stress and loanwords), English on par.
  Engine `"qwen"`; `"chatterbox"` in old scripts and profiles still works (mapped to qwen, with a note).
  Tones are a sample plus `"text"`, its transcript; `exaggeration` / `cfg` are gone (the clone takes the
  tone from the sample), optional `"temperature"`. Fixed seed per take, so rebuilds are reproducible.
- `vk voice-setup` stores each sample's transcript, adds it to existing tones that lack one and drops the
  old Chatterbox settings. It skips tones that are already set up, so adding a language later no longer
  redoes the existing samples; `--redo [tone ...]` redoes them on purpose. Whisper loads only when needed.
- A rebuild of a project made with Chatterbox narrates it again with Qwen3-TTS (new voice cache key):
  keep the delivered files in `out/` if the posted video must stay identical.
- `vk voice-setup` warns about recordings left in `voices/raw/` at the kit root (pre-0.4 layout), which
  `.gitignore` now also ignores.
- `setup.ps1 -Voice clone` installs Qwen3-TTS; `-Check` reports it and notes a leftover `py/chatterbox`.

## 0.4.0 (2026-11-08)

- Product layout: everything personal in `user/` (git-ignored): profile (name, brand, default voice,
  language, style), voice samples and tones, music, notes; `user.example/` template; scripts inherit
  the profile's defaults.
- First run: `kit-setup` skill, `setup.ps1 -Check` (read-only) and `-Voice synthetic|clone`,
  `-Music generate|files`; `vk voice-setup` turns raw recordings into clone samples and tones;
  recording guide in English and Portuguese (`docs/voice.md`); `<tone>_<lang>` samples picked per language.
- Developer scenes: terminal, highlighted code with focus steps, animated diffs, architecture diagrams
  with flowing packets (auto top-to-bottom in portrait), git history timeline, kinetic titles with marker.
- Screen demos: `vk capture` (Playwright) records a scripted browser session with click events; zoom and
  cursor with click ripples follow them (`events`, or manual `zoom` / `clicks`).
- Talking head: `talk: true` uses a clip's own audio as narration and captions; `vk cut` removes silences
  (`--punch` alternates a slight zoom); `vk transcribe` for picking short segments.
- Finishing: caption looks (box, plain, pill, pop), film grain and vignette, light leaks on cuts, brand
  logo on cards and titles, styles `midnight` and `editorial`.
- Audio: sound peaks land one frame after the picture event; generic sound names rotate takes;
  `beat_sync` snaps slideshow switches to the soundtrack's beat.
- `vk qa`: speech match on the final mix, pace per scene, loudness (master and per scene), black and
  frozen frames, first frame, length vs target.
- Removed: the Blender turntable scene (generating material belongs to each project).
- Fix: every scene scales by the frame's short side, so 16:9 is no longer oversized.

## 0.3.0 (2026-11-08)

- Transitions per scene: fade, slide, wipe, zoom, cut (`transition`, `item_transition`).
- Sound effects: 20 CC0 sounds in `sfx/` (Kenney / OpenGameArt via agent-video-editor), placed by word
  cue or time; automatic whoosh on slide/wipe; typing and pop sounds in chat scenes.
- Slideshow items switch on a spoken word (`cue`), using Whisper timings.
- Portuguese narration: Chatterbox multilingual with the same voice sample; per-language speaking rate in `vk check`.
- ACE-Step XL turbo tested (works with the 1.7B LM; the 4B LM does not fit in 24 GB).

## 0.2.0 (2026-11-07)

- `vk check`: missing media, words and estimated seconds per scene, total vs `target`.
- `vk sheet`: contact sheet with timestamps of a rendered video.
- `target` in script.json; the build warns when the video runs over.
- Music generated with ACE-Step 1.5 at the video's exact length (`music.generate`, seeds and variants).
- Final audio mastering to ~-14 LUFS, true peak -1.5 dB.
- Scene kinds: animated chat window; slideshows with per-image labels; PDF pages (`file.pdf#3`); label
  and badge chips; `keep_headline`.
- Voice tones per speaker (`voices/tones.json`) and per scene (`"voice": "energia"`); `pronounce` map.
- `--placeholders` drafts; `setup.ps1`; docs (README, checklist, lessons learned).
- Fix: AVG's `SSLKEYLOGFILE` crashed standalone Pythons; all venvs on the system Python.

## 0.1.0 (2026-11-07)

- First pipeline: script.json → Kokoro / Chatterbox / recorded narration → Whisper captions aligned to
  the script → Remotion (themes clean, bold, tech; media, cards, Manim scenes) → MP4, cover, SRT.
