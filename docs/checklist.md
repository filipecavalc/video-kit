# Video checklist

## 1. Before production (script)

- [ ] Goal, audience, platform and main format defined (LinkedIn feed: 4x5; shorts: 9x16; YouTube: 16x9).
- [ ] Target length set (`"target"` in script.json; LinkedIn: 45–75 s).
- [ ] Script written in text and approved by the person. Nothing rendered before that.
- [ ] A real story (who, problem, turn, solution, proof, call to action) with facts the person supplied.
- [ ] Every claim checked at its source: the project's README or code, or confirmed by the person.
      Tested platforms, languages, features that exist in the public code, numbers (time, amounts).
- [ ] Origin and date of every image and clip known; nothing of uncertain origin.
- [ ] Consent from anyone who appears (family, colleagues, clients).
- [ ] Narration and on-screen text in the video's language.

## 2. Assembly

- [ ] `vk check <p>`: missing media, estimated length vs target.
- [ ] `vk build <p> --preview`.
- [ ] `vk sheet <p> --preview`, read scene by scene:
  - [ ] each line matches the image (subject, pronoun, what is shown);
  - [ ] headline, label, badge and captions do not overlap; nothing important sits under the captions;
  - [ ] nothing cut at the edges (check every format);
  - [ ] cover without captions and without third-party brands in focus.
- [ ] Read `out/<p>.srt`: spelling of names and products (use `pronounce` if the voice gets one wrong).
- [ ] The person listens to the voice and the soundtrack (a score never replaces the ear).

## 3. Delivery

- [ ] Final `vk build <p>`, then `vk qa <p>`: speech match, pace, loudness (-14 LUFS, peak <= -1 dB),
      black/frozen frames, still picture (nothing happening for 2.5 s), length. Fix every WARN or explain it.
- [ ] Deliver: MP4 of the main format, cover PNG, SRT. Post text as plain text (LinkedIn ignores markdown).
- [ ] Note in the project's own notes what was delivered and what is still open.
- [ ] A new lesson? Add it to `docs/lessons.md`.
