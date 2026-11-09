# user/voices/

Voice samples for cloning (Qwen3-TTS). Lives in `user/`, which git ignores: a voice sample is biometric
data and never leaves your machine.

- `<speaker>_<tone>.wav`: reference clips, at most ~10 s, whole sentences, no music or noise.
- `tones.json`: per speaker, which clip each tone uses (`"tone"` in a script) and `"text"`, exactly what
  is said in it. Optional `"temperature"` (default 0.9, lower = steadier).
- For another language, record samples in that language and add tones such as `narracao_pt`.
- `raw/` original recordings, `takes/` cleaned takes, `variantes/` listening tests.

Only clone your own voice, or a voice whose owner agreed. Recording guide: `docs/voice.md`.
