# sfx/

Sound effects, all **CC0 1.0** (no attribution required, commercial use allowed). Copied on 2026-11-07
from [kmilo93sd/agent-video-editor](https://github.com/kmilo93sd/agent-video-editor)
(`skills/editing-videos/library/sfx`), whose `LICENSES.md` records the source page and original file of
every sound (Kenney packs, OpenGameArt, or generated). That file is kept here as `LICENSES-source.md`.

Not used on purpose: Remotion's `remotion.media` sounds. Their pages credit Freesound/Kenney authors under
"Creative Commons Attribution", so they would need a credit line.

| name | use |
|---|---|
| whoosh-soft, whoosh-short, whoosh-medium-1s, slide-1 | slide/wipe transitions |
| page-turn, paper-shuffle | documents, PDF pages |
| pop-1, pop-2, appear, tap | chips, badges, chat replies |
| click-soft, click-mouse | UI, chat message sent |
| keyboard-typing-1s, keyboard-typing-3s | typing in the chat |
| check-mark, success-chime, notification-1 | checks passed, end card |
| impact-wood-light | woodworking accents |
| swell-soft-3s, riser-short-2s | build-up before a reveal |

In script.json: `"sfx": [{"name": "page-turn", "cue": "cutting"}]` on a scene, or `"at": 1.2` seconds
from the scene start. Transitions `slide`/`wipe` add a whoosh automatically unless `"auto_sfx": false`.
