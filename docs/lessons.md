# Lessons learned

Real mistakes and findings from producing videos with this kit. Each row: what happened, and what the
kit or the process does now so it does not happen again.

## Content and process

| What happened | Rule now |
|---|---|
| Two drafts were rendered before the script was approved; the script was rejected. | Script in text first. No narration or render before approval. |
| The first script was a feature list. What worked was the real story (who, problem, turn, proof). | Classic storytelling with facts supplied by the person; never invent them. |
| A video claimed "Windows, Mac and Linux" while the project's README says Linux is untested. | Every claim is checked against its source (README, code, the person). |
| A feature that only existed in a private project was almost presented as part of the public one. | A capability is claimed only if it is in the public code. |
| "In your language" promised more than the tool does (two languages). | Capability lines state the real limit. |
| A photo of something built before the product existed was about to illustrate the product. | Check each image's date and origin before tying it to a claim. |
| An image of unknown origin (product render or image generator?). | Unknown origin: leave it out. |
| The line "so **he** could…" played over a photo of someone else. | Check every line's subject and pronouns against the image on screen. |
| An 86 s video for a ~60 s target. | `target` in script.json; `vk check` estimates before any audio is generated. |
| Cover and opening showed a TV full of third-party brand artwork. | Check the cover and hook for third-party brands. |
| Slideshow images switched in equal parts, out of sync with the narration. | Items take `"cue": "word"` and switch when it is spoken. |
| A generator that only one project needed (3D turntable in Blender) was added to the kit. | The kit assembles material; generating it belongs to the project. |

## Voice

- Short samples (up to ~10 s), whole sentences, no noise.
- Chatterbox (the clone engine until 0.4) sounded wrong in Portuguese even with Portuguese samples:
  bad stress, loanwords like "kit" mangled. Qwen3-TTS, compared by ear on the same phrase and samples,
  was much closer in Portuguese and as good in English, so it replaced Chatterbox. Compare engines on the
  same phrase, sample and seed, and let the speaker listen.
- Qwen3-TTS clones from the sample plus its transcript: a wrong word in `"text"` hurts the clone.
- A speaker-similarity score preferred one sample; by ear, another sounded more like the speaker.
  **The speaker's ear decides.**
- A clone made from an English sample sounds wrong in Portuguese: record samples in each language you
  narrate in (`<tone>_<lang>` tones are picked automatically).
- Re-running `vk voice-setup` to add a language redid the existing samples too and reset the tones
  chosen by ear. It now skips tones already set up; `--redo` is explicit.

## Technical (Windows)

| Problem | Fix |
|---|---|
| ffmpeg download from gyan.dev stalled. | BtbN build from GitHub. |
| Some antivirus (AVG) sets `SSLKEYLOGFILE` to a device path; standalone Pythons abort with "OPENSSL_Uplink … no OPENSSL_Applink". | `kit.setup_env()` and `setup.ps1` remove the variable. |
| Antivirus HTTPS interception breaks downloads. | `uv … --system-certs`; `models/ca-bundle.pem` (certifi + the antivirus root) for Hugging Face. |
| Inside an MSIX-packaged desktop app, files written to AppData land in a private copy other programs do not see. | All venvs on the system Python; Playwright browsers in `tools/playwright`. |
| Kokoro's phonemizer tries to `uv pip install` a spaCy model outside the venv. | `en-core-web-sm` pinned in `py/main/pyproject.toml`. |
| Qwen3-TTS pins `transformers==4.57.3`, which other envs do not want. | Its own venv (`py/qwen`), run as a subprocess like the music engine. |
| Manim keeps a 16:9 logical frame with portrait pixels: tiny diagrams. | `vk_manim.fit_frame()` and `content_area()`. |
| Scaling the active caption word covered the spaces around it. | Spaces stay outside the word's span; "pop" adds margin as it scales. |
| Whisper stretches the last word over the following silence. | Words capped at 1.2 s; a caption page leaves 0.7 s after its last word. |
| Whisper "hears" "Thank you." in instrumental music. | Known hallucination; listen to the track. |
| The cover had burned-in captions. | Cover rendered with `noCaptions`. |
| Final mix at -18 LUFS. | `master_audio` normalises to about -14 LUFS, true peak -1.5 dB. |
| Remotion's hosted sound effects looked CC0 but their pages credit "Creative Commons Attribution". | Only sounds with CC0 verified at the source (`sfx/LICENSES-source.md`). |
| ACE-Step XL + 4B LM overflowed 24 GB of VRAM and crawled for >10 min. | XL with the 1.7B LM; check `nvidia-smi` when something is slow. |
| A Hugging Face download timed out halfway. | Run it again (it resumes); `HF_HUB_DOWNLOAD_TIMEOUT=120`. |
| A render with strange colours (magenta) came from a missing texture, not a colour bug. | Read the renderer's log for "does not exist" first. |
| `vk check` underestimated a Portuguese video (82 s predicted, 100 s real). | Speaking rate per language. |
| One render failed with "Error while getting compositions". | Transient: re-run that format only (`--format 9x16`). |
| `"leak": {}` was read as "off" (empty dict is falsy). | Presence of the key turns it on; `false` turns it off. |
| Every scene of a cloned-voice video started with a stray "free.": the voice sample had been cut while still saying it, and its transcript still had the word. | A sample ends in silence at a word end and its `"text"` matches the audio exactly (the build now warns). Check by transcribing the raw clips in `build/voice/`, not only the final mix. |
| A narration read like a telegram: colons and a bare project name, written for the eye. | Write for the ear: full sentences, no colon doing the work of a sentence, an article before names. |
| A technical video felt flat: terminals two lines high in an empty window, a diagram that stood still, a minute without the product on screen. | Plan the visuals sentence by sentence; something new every 1.5-3.5 s; `vk qa` flags frozen stretches. |
