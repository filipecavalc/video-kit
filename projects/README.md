# projects/

One folder per video (`vk new <name>`). Only `example/` and `example-dev/` are versioned; real projects
hold personal photos and voice and stay local.

```
<name>/
  script.json     scenes, narration, voice, music, formats (see CLAUDE.md)
  notes.md        (optional) script discussion, decisions, deliverables
  assets/         photos and clips used by the video
  audio/rec/      your own takes (voice engine "recorded"), one per scene id
  manim/          Manim scenes (diagrams)
  build/          generated: narration, captions, music, timelines (safe to delete)
  out/            deliverables: MP4 per format, cover PNG, SRT, review sheet
```
