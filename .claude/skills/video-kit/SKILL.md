---
name: video-kit
description: Produce a narrated, captioned video with video-kit (promo, demo, explainer, short, case study) from a script.json; or add a scene type, style or check to the kit. Use for any request to make, edit, re-render or review a video in this repo.
---

# Making a video

Read `CLAUDE.md` first (script.json reference, scene types, commands). If `user/profile.json` is missing,
run the `kit-setup` skill instead.

The kit **assembles** material the project provides (screenshots, recordings, renders, PDFs, photos, code,
diagrams as data). It does not invent footage and does not generate material with project-specific tools.

1. **Brief**: goal, audience, platform, length (`target`), formats, style, language(s), voice.
2. **Material**: list what exists and what the person must provide. Never fabricate footage or facts.
3. **Script in text first** and get explicit approval before generating narration or rendering.
   Classic storytelling with real facts (who, problem, turn, solution, proof, call to action). Every claim
   is checked against its source (README, code, the person). Every image matches the line spoken over it.
4. **Visual plan**, sentence by sentence, before writing `script.json`: what is on screen while each sentence
   is spoken, and what changes on its key word. Something new every 1.5-3.5 s; the thing named appears within
   about 1.5 s of the word (use `cue`). Pick the device by what the sentence does:

   | the sentence... | show it with |
   |---|---|
   | names a thing you can see | that image or clip; `camera` punch-in on the detail, `annotate` circle/arrow on its word |
   | is about a physical object with a 3D model | `model` (.glb): turntable, `explode` on the word, `labels`, `highlight` the part named |
   | says how something works | `diagram` with `flows` cued on each step (or a manim scene) |
   | shows a command or a result | `terminal`: `cmd` lines cued on the words, `stream` for long output, `count` for the final number |
   | gives a number | `stats` counter (several numbers: one scene, staggered) |
   | describes a before/after or a fix | `code` diff with `turn` on the word |
   | points at a line of code or a rule | `code` with `focus` steps, `camera` on the line, `annotate` underline |
   | is a request or a conversation | `chat` |
   | is the hook or a turning point | `kinetic` (over an image or clip with `media` when there is one) |
   | is a product flow in a browser | screen demo (`vk capture`), zooms and clicks from its events |

   Avoid two quiet devices in a row (a kinetic title then a terminal waiting for its first command).
5. `vk new <name>`, write `script.json`, `vk check <name>` (missing media, length vs target).
6. `vk build <name> --preview` → `vk sheet <name> --preview` → read the sheet and `out/<name>.srt`.
7. Final `vk build <name>`, then `vk qa <name>` (speech match, black/frozen frames, loudness, pace, still picture).
   A "still picture" warning means a stretch where nothing happens: fix it with a cue, a camera move, a mark
   or a split scene, not by ignoring it.
8. Deliver: MP4 per format, cover PNG, SRT; post text as plain text (no markdown) when asked.

Checklist: `docs/checklist.md`. Lessons learned: `docs/lessons.md`.

# Extending the kit

- Scene: component in `remotion/src/scenes/`, type in `types.ts`, wiring in `Main.tsx`, timeline entry in
  `pipeline/build.py`, a case in `projects/example*`, docs in `CLAUDE.md`. Type-check: `npx tsc --noEmit`.
- Style: `remotion/src/styles.ts` (+ `caption_y` in `pipeline/vk_manim.py`).
- For Remotion API questions, use the `remotion-best-practices` skill.
