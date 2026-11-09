---
name: kit-setup
description: First-run setup of video-kit. Use when user/profile.json does not exist, when the person asks to install or configure the kit, add their voice, or check what is missing.
---

# video-kit first run

Talk to the person in their language. Ask, do not assume; install only what they choose.

1. **Check** (read-only): `powershell -ExecutionPolicy Bypass -File setup.ps1 -Check`. Explain what is
   missing in plain words. Python 3.12, Node.js, uv and git are installed by the person (give the links
   the check prints). Windows 10/11 only. Without an NVIDIA GPU: synthetic voice (cloning runs on the CPU,
   slowly), and music from their own files or none (videos still render).
2. **Ask three things**, explaining the trade-off of each:
   - **Voice**: synthetic (Kokoro, ready now, sounds synthetic) or their own cloned voice (Qwen3-TTS,
     English, Portuguese and 8 more languages: record 3 short texts 2–3 times each in every language
     they narrate in, about 10 minutes per language with 2–3 minutes of audio, once; ~4.5 GB of weights, GPU). Only their own voice or one they have
     consent for. Voice samples stay in `user/`, never in git.
   - **Music**: generated per video at the exact length (ACE-Step, ~10 GB once, GPU) or their own tracks.
   - **Languages** they will publish in, and the default one.
   Also ask their name/handle and a brand colour (or keep the default amber).
3. **Install**: `powershell -ExecutionPolicy Bypass -File setup.ps1 -Voice <synthetic|clone> -Music <generate|files>`.
   Then edit `user/profile.json` with name, handle, accent, languages and default language.
4. **Cloned voice**: hand them the recording guide (`docs/voice.md`), wait for the files in
   `user/voices/raw/`, run `vk voice-setup`, and ask them to listen to the samples. Their ear decides:
   if a tone does not sound like them, point it at the sample that does in `user/voices/tones.json`.
5. **Prove it works**: `vk build example --preview`, then `vk sheet example --preview` and look at the
   sheet. Fix anything broken before moving on.
6. **First real video**: `vk new <name>`, then follow the `video-kit` skill (script first, approval, then render).

Never copy anything from `user/` or `projects/` into the repository.
