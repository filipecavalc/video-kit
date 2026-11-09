# Voice

Three ways to narrate, set per video (`"voice"` in script.json) or as your default (`user/profile.json`):

| engine | what you need | quality |
|---|---|---|
| `kokoro` | nothing (synthetic voices, `vk voices`) | clean, clearly synthetic |
| `qwen` | 2–3 minutes recording your own samples, once per language | your voice, any text (Qwen3-TTS) |
| `recorded` | record every scene yourself (`audio/rec/<scene id>.wav`) | your real take, cleaned automatically |

Only clone your own voice, or a voice whose owner agreed. Samples live in `user/voices/`, which git
ignores: they never leave your machine.

## Recording your samples (for `qwen`)

The clone copies the tone, accent and pacing of the sample, so record in the language you will narrate in
and in the tone you want.

1. Software: Audacity (free). Audio setup: your microphone, **1 channel (mono)**, **48000 Hz**.
2. Level: speak normally; peaks between **-12 and -6 dB**, never in the red.
3. Room: quiet, no fan or AC; a room with curtains or a sofa beats a kitchen. Mic 15–20 cm from the
   mouth, slightly to the side, same position every take.
4. Each text below **2 or 3 times in one file**, with a short pause between repetitions and 2 s of
   silence at the start.
5. Export: File → Export Audio → WAV 16-bit, into `user/voices/raw/` with the file name shown.
6. Run `vk voice-setup` (`--dry-run` first to see which take it would pick): it finds the repetitions,
   picks the best one and creates your tones: the sample plus `"text"`, what is said in it (the clone
   learns your voice from both). Tones that already exist are skipped, so you can leave old recordings
   in `raw/` and add another language later without losing the samples you chose by ear. To redo some:
   `vk voice-setup --redo energia narracao_pt` (`--redo` alone redoes all).
7. Listen to `user/voices/<speaker>_<tone>.wav` and to a test video. If a tone does not sound like you,
   point it at the sample that does (`user/voices/tones.json`, with that sample's `"text"`): your ear
   decides. Check that `"text"` matches what the sample says, word for word.

### English

**`narracao.wav`**: calm and confident, as if explaining to a colleague.
> I like turning messy problems into simple tools. Last month I rebuilt a report that took ten minutes to load, and now it runs in under a second. Small changes, measured carefully, add up to a big difference.

**`energia.wav`**: the energy of a short video's opening.
> What if your whole video could come from a single script? No editing timeline. No guesswork. You write it, run one command, and get the narration, the captions and the music. Let me show you how it works.

**`explica.wav`**: a bit slower, like a tutorial.
> First, the script lists every scene and what is said over it. Then the narration is generated and timed word by word. After that, the music is created at the exact length, and finally every format is rendered.

### Português (pt-BR)

**`narracao_pt.wav`**
> Eu gosto de transformar problemas bagunçados em ferramentas simples. No mês passado eu refiz um relatório que levava dez minutos para carregar, e agora ele roda em menos de um segundo. Pequenas mudanças, bem medidas, fazem muita diferença.

**`energia_pt.wav`**
> E se o seu vídeo inteiro pudesse sair de um único roteiro? Sem linha do tempo de edição. Sem chute. Você escreve, roda um comando e recebe a narração, as legendas e a música. Deixa eu te mostrar como funciona.

**`explica_pt.wav`**
> Primeiro, o roteiro lista cada cena e o que é dito nela. Depois, a narração é gerada e sincronizada palavra por palavra. Em seguida, a música é criada na duração exata e, por fim, cada formato é renderizado.

Tones then become `narracao_pt`, `energia_pt`, `explica_pt`. A script with `"language": "pt"` and
`"voice": {"engine": "qwen", "tone": "narracao"}` picks `narracao_pt` by itself.

## Tips

- The clone copies the sample's tone, pace and accent: each tone sounds like its own sample, so record
  each text in the mood you want. `vk voice-setup` cuts whole sentences up to 9.8 s.
- `"temperature"` in a tone (default 0.9) trades variety for steadiness: lower is flatter and safer.
- Same text and settings give the same take (fixed seed); change `"seed"` in the voice settings for another.
- Loanwords (kit, deploy) can come out with the wrong accent: `pronounce` respells what is spoken
  without changing the captions.
- A speaker-similarity score can disagree with your ear. Trust your ear.
- Your own takes (`recorded`) get high-pass, light denoise, compression and silence trimming.
