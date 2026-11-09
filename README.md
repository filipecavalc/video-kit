# video-kit

Turn a `script.json` into a finished social video, locally and for free: narration in a synthetic voice
or your own cloned voice, word-by-word captions, a soundtrack generated at the exact length, and scenes
made for showing technical work: terminals, code with focus and diffs, architecture diagrams with data
flowing, git history, web-app demos with zoom and cursor, talking-head takes with silences cut.
Built to be driven by Claude Code; every step is also a plain command.

```
script.json ─► narration ─► captions ─► timeline ─► Remotion render ─► MP4 + cover + SRT ─► vk qa
              Kokoro /     Whisper     scenes,      styles, captions,  -14 LUFS master       speech, pace,
              your voice /  + script    soundtrack,  transitions, sfx,                         loudness, frames
              your takes    alignment   beat sync    film look
```

## Scenes

| | |
|---|---|
| **Media** | photos, clips (trim, speed), PDF pages, slideshows that switch on a spoken word |
| **Screen demo** | `vk capture` records a scripted browser session; zoom and cursor follow the clicks |
| **Talking head** | `vk cut` removes silences; the clip's own audio becomes the narration and captions |
| **Developer** | terminal (typed commands, streaming logs, rolling counts), highlighted code with focus steps, animated diffs, architecture diagrams, git timeline, stats counters, 3D models (.glb) with exploded views and labels |
| **Text** | kinetic titles with a marker highlight, cards, animated chat |
| **Diagrams** | Manim scenes sized for every format |

Finishing: 5 styles (clean, bold, tech, midnight, editorial), 4 caption looks, transitions (fade, slide,
wipe, zoom, cut), light leaks, grain and vignette, 20 CC0 sound effects placed on spoken words, music that
ducks under speech, beat-synced cuts, loudness mastering for social feeds.

## Stack

| Layer | Tool | License |
|---|---|---|
| Composition / render | [Remotion](https://www.remotion.dev) 4 | free for individuals and companies of up to 3 people; check [its license](https://www.remotion.dev/license) |
| Synthetic voice | [Kokoro-82M](https://huggingface.co/hexgrad/Kokoro-82M) | Apache-2.0 |
| Voice cloning | [Qwen3-TTS](https://github.com/QwenLM/Qwen3-TTS) (1.7B Base) | Apache-2.0 |
| Captions | [OpenAI Whisper](https://github.com/openai/whisper) | MIT |
| Soundtrack | [ACE-Step 1.5](https://github.com/ace-step/ACE-Step-1.5) | MIT |
| Diagrams | [Manim](https://www.manim.community) | MIT |
| Code highlighting | [Pygments](https://pygments.org) | BSD |
| Browser capture | [Playwright](https://playwright.dev/python/) | Apache-2.0 |
| Beat detection | [librosa](https://librosa.org) | ISC |
| Sound effects | Kenney, OpenGameArt (via [agent-video-editor](https://github.com/kmilo93sd/agent-video-editor)) | CC0 |
| Audio/video plumbing | [ffmpeg](https://ffmpeg.org), downloaded by setup | GPL |

Tested on Windows 11 with an NVIDIA RTX 4090. Voice cloning and music generation need an NVIDIA GPU;
synthetic voice and your own music files work without one.

## Getting started

Open the folder in Claude Code and say "set up the kit": the `kit-setup` skill checks your machine,
asks which voice and music you want, installs only that, and renders the examples. By hand:

```powershell
powershell -ExecutionPolicy Bypass -File setup.ps1 -Check                         # what is missing
powershell -ExecutionPolicy Bypass -File setup.ps1 -Voice synthetic -Music generate
vk build example --preview
vk sheet example --preview
```

Needs Python 3.12, Node.js 20+, uv and git. Model weights (up to ~20 GB with music) download on first use.

**Your data stays yours.** Your profile, brand, voice samples, music and projects live in `user/` and
`projects/`, which git ignores. Only clone your own voice, or one whose owner agreed.

## Making a video

```
vk new my-video         # then write script.json (see CLAUDE.md)
vk check my-video       # missing media, estimated length vs target
vk build my-video --preview && vk sheet my-video --preview
vk build my-video && vk qa my-video
```

Examples: `projects/example` (25 s, synthetic voice, chat, Manim, generated music) and
`projects/example-dev` (developer showcase: kinetic title, terminal, diagram, code focus and diff, web
demo with zoom and cursor, git history, film look).

## Docs

- [CLAUDE.md](CLAUDE.md): script.json reference, scene types, commands
- [docs/checklist.md](docs/checklist.md): from script to delivery
- [docs/voice.md](docs/voice.md): recording your voice samples
- [docs/lessons.md](docs/lessons.md): mistakes already made, and the fixes
- [CHANGELOG.md](CHANGELOG.md)
