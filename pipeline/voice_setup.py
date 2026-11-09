"""vk voice-setup: turn raw recordings into voice-clone samples and tones.

Record each text from docs/voice.md 2-3 times in one file, with a short pause between repetitions:
    user/voices/raw/energia.wav, narracao.wav, explica.wav        (English)
    user/voices/raw/energia_pt.wav, narracao_pt.wav, ...          (another language: suffix _<lang>)
Then:  vk voice-setup [--speaker me] [--dry-run] [--redo [TONE ...]]
For every file it finds the repetitions (Whisper), scores them (script match, level, fluency), cuts the
best whole-sentence window of <= 9.8 s, saves user/voices/<speaker>_<tone>.wav and adds the tone to
user/voices/tones.json with "text", what is said in the sample (Qwen3-TTS clones from sample + transcript).
Listen to the result: your ear decides, not the score.
Tones that are already set up are skipped, so adding a language later keeps the samples and settings you
chose by ear; --redo redoes them all, --redo energia narracao_pt only those.
Tones without "text" (set up by hand, or before 0.5) get it from a transcript of their sample.
"""
from __future__ import annotations

import difflib
import json
import re
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import kit  # noqa: E402

kit.setup_env()

# Recording texts (same as docs/voice.md). Key = tone[_lang].
TEXTS = {
    "narracao": "I like turning messy problems into simple tools. Last month I rebuilt a report that took ten minutes to load, and now it runs in under a second. Small changes, measured carefully, add up to a big difference.",
    "energia": "What if your whole video could come from a single script? No editing timeline. No guesswork. You write it, run one command, and get the narration, the captions and the music. Let me show you how it works.",
    "explica": "First, the script lists every scene and what is said over it. Then the narration is generated and timed word by word. After that, the music is created at the exact length, and finally every format is rendered.",
    "narracao_pt": "Eu gosto de transformar problemas bagunçados em ferramentas simples. No mês passado eu refiz um relatório que levava dez minutos para carregar, e agora ele roda em menos de um segundo. Pequenas mudanças, bem medidas, fazem muita diferença.",
    "energia_pt": "E se o seu vídeo inteiro pudesse sair de um único roteiro? Sem linha do tempo de edição. Sem chute. Você escreve, roda um comando e recebe a narração, as legendas e a música. Deixa eu te mostrar como funciona.",
    "explica_pt": "Primeiro, o roteiro lista cada cena e o que é dito nela. Depois, a narração é gerada e sincronizada palavra por palavra. Em seguida, a música é criada na duração exata e, por fim, cada formato é renderizado.",
}
OBSOLETE = ("exaggeration", "cfg")  # Chatterbox settings (before 0.5); Qwen3-TTS takes the tone from the sample
AF = "highpass=f=70,loudnorm=I=-20:TP=-2:LRA=11"


def norm(w: str) -> str:
    return re.sub(r"[^\w]", "", w.lower())


def split_takes(words: list[dict], script: str) -> list[list[dict]]:
    """Repetitions start where the script's first two words reappear after a pause or sentence end."""
    first = [norm(w) for w in script.split()[:2]]
    n = [norm(w["w"]) for w in words]
    starts = [i for i in range(len(n) - 1) if n[i:i + 2] == first
              and (i == 0 or words[i]["s"] - words[i - 1]["e"] > 0.3 or words[i - 1]["w"].strip()[-1:] in ".?!")]
    if not starts:
        return [words]
    return [words[a:b] for a, b in zip(starts, starts[1:] + [len(words)])]


def best_window(take: list[dict], max_len: float = 9.8) -> tuple[int, int, float]:
    best = (0, 0, 0.0)
    for s in range(len(take)):
        if s and take[s - 1]["w"].strip()[-1:] not in ".?!":
            continue
        for j in range(s, len(take)):
            length = take[j]["e"] - take[s]["s"]
            if length > max_len:
                break
            if (take[j]["w"].strip()[-1:] in ".?!" or j == len(take) - 1) and length > best[2]:
                best = (s, j, length)
    return best


def main() -> None:
    import argparse

    import numpy as np
    import soundfile as sf
    import torch
    import whisper

    ap = argparse.ArgumentParser(prog="vk voice-setup")
    ap.add_argument("--speaker", default=kit.profile().get("speaker", "me"))
    ap.add_argument("--dry-run", action="store_true", help="report the takes it would pick; write nothing")
    ap.add_argument("--redo", nargs="*", metavar="TONE",
                    help="redo tones that are already set up (all of them, or only the ones named, e.g. energia narracao_pt)")
    a = ap.parse_args(sys.argv[1:])
    redo_all = a.redo == []
    redo = set(a.redo or [])
    raw = kit.USER_VOICES / "raw"
    audio = (".wav", ".mp3", ".m4a", ".flac", ".ogg", ".webm")
    files = sorted(p for p in raw.glob("*.*") if p.suffix.lower() in audio)
    stray = [p.name for p in (kit.KIT / "voices" / "raw").glob("*.*") if p.suffix.lower() in audio]
    if stray:  # the pre-0.4 layout kept recordings at the kit root
        print(f"warning: {', '.join(stray)} in {kit.KIT / 'voices' / 'raw'} are not read; move them to {raw}")
    tones_file = kit.USER_VOICES / "tones.json"
    tones = json.loads(tones_file.read_text(encoding="utf-8")) if tones_file.exists() else {}
    mine = tones.get(a.speaker, {})
    missing_text = [k for k, t in mine.items() if isinstance(t, dict) and not t.get("text")]
    if not files and not missing_text:
        raise SystemExit(f"No recordings in {raw}. See docs/voice.md for what to record.")
    model = None  # loaded only when there is something to transcribe
    new = 0
    work = kit.USER_VOICES / "takes"
    work.mkdir(parents=True, exist_ok=True)

    def whisper_model():
        nonlocal model
        if model is None:
            model = whisper.load_model("turbo", device="cuda" if torch.cuda.is_available() else "cpu",
                                       download_root=str(kit.MODELS / "whisper"))
        return model

    for src in files:
        key = src.stem.split("_N")[0]  # "narracao_N.wav" -> "narracao"
        if key not in TEXTS:
            print(f"skip {src.name}: unknown text (expected one of {', '.join(TEXTS)})")
            continue
        tone, _, lang = key.partition("_")
        lang = lang or "en"
        tone_key = tone if lang == "en" else f"{tone}_{lang}"
        name = f"{a.speaker}_{tone}{'_' + lang if lang != 'en' else ''}.wav"
        # Set up = its sample exists. The template's placeholder tones (no sample yet) do not count.
        ref = tones.get(a.speaker, {}).get(tone_key, {}).get("ref")
        done = (kit.USER_VOICES / name).exists() or bool(ref and (kit.USER / ref).exists())
        if done and not (redo_all or tone_key in redo):
            print(f"skip {src.name}: tone '{tone_key}' is already set up (vk voice-setup --redo {tone_key} to redo it)")
            continue
        new += 1
        mono = work / f"{key}_mono.wav"
        kit.run([kit.ffmpeg(), "-y", "-i", str(src), "-ac", "1", "-ar", "48000", str(mono)])
        # The recording text as prompt: the transcript follows its spelling ("dez", not "10").
        res = whisper_model().transcribe(str(mono), language=lang, word_timestamps=True, initial_prompt=TEXTS[key],
                                         fp16=torch.cuda.is_available())
        words = [{"w": w["word"], "s": w["start"], "e": w["end"], "p": w["probability"]} for seg in res["segments"] for w in seg["words"]]
        data, sr = sf.read(mono)
        target = [norm(t) for t in TEXTS[key].split()]
        scored = []
        for t_i, take in enumerate(split_takes(words, TEXTS[key]), 1):
            take = [w for w in take if w["e"] - w["s"] < 3 and w["p"] > 0.2]
            if len(take) < 4:
                continue
            match = difflib.SequenceMatcher(a=[norm(w["w"]) for w in take], b=target, autojunk=False).ratio()
            seg = data[int(take[0]["s"] * sr):int(take[-1]["e"] * sr)]
            level = 20 * np.log10(np.sqrt(np.mean(seg ** 2)) + 1e-9)
            clipped = int((np.abs(seg) > 0.98).sum())
            conf = float(np.mean([w["p"] for w in take]))
            s, j, length = best_window(take)
            score = match * 2 + conf - (0.5 if clipped > 20 else 0) - (0.3 if level < -35 else 0) + min(length, 9.8) / 20
            scored.append((score, t_i, take, s, j, length, match, level, clipped))
            print(f"  {key} take {t_i}: match {match:.2f}  conf {conf:.2f}  level {level:.1f} dB  clipped {clipped}  window {length:.1f}s")
        if not scored:
            print(f"  {key}: no usable take found")
            continue
        score, t_i, take, s, j, length, *_ = max(scored, key=lambda x: x[0])
        said = "".join(w["w"] for w in take[s:j + 1]).strip()
        if a.dry_run:
            print(f"-> would save {name}: take {t_i}, {length:.1f}s  \"{said}\"")
            mono.unlink(missing_ok=True)
            continue
        out = kit.USER_VOICES / name
        kit.run([kit.ffmpeg(), "-y", "-ss", f"{max(0, take[s]['s'] - 0.1):.2f}", "-to", f"{take[j]['e'] + 0.2:.2f}", "-i", str(mono),
                 "-af", AF, "-ar", "24000", "-ac", "1", str(out)])
        # A redo keeps settings set by hand (e.g. "temperature"); the sample and its transcript are new.
        prev = {k: v for k, v in tones.get(a.speaker, {}).get(tone_key, {}).items() if k not in OBSOLETE}
        tones.setdefault(a.speaker, {})[tone_key] = {**prev, "ref": f"voices/{name}", "text": said}
        print(f"-> {name}: take {t_i}, {length:.1f}s  (tone '{tone_key}')  \"{said}\"")
        mono.unlink(missing_ok=True)

    # Tones without a transcript (made by hand, or with Chatterbox before 0.5): transcribe their sample.
    fixed = 0
    for tone_key, t in tones.get(a.speaker, {}).items():
        if not isinstance(t, dict) or (t.get("text") and not any(k in t for k in OBSOLETE)):
            continue
        sample = kit.USER / t.get("ref", f"voices/{a.speaker}_{tone_key}.wav")
        if not sample.exists():
            if t.get("text") or any(k in t for k in OBSOLETE):  # a real tone lost its sample; placeholders stay quiet
                print(f"  {tone_key}: sample {sample} not found, left as is")
            continue
        if not t.get("text"):
            lang = tone_key.rpartition("_")[2] if "_" in tone_key else "en"
            said = whisper_model().transcribe(str(sample), language=lang, fp16=torch.cuda.is_available())["text"].strip()
            print(f"  {tone_key}: transcript of {sample.name}: \"{said}\"  (correct it in tones.json if a word is wrong)")
            t["text"] = said
        for k in OBSOLETE:
            t.pop(k, None)
        fixed += 1

    shared = {}
    for tone_key, t in tones.get(a.speaker, {}).items():
        if isinstance(t, dict) and t.get("ref"):
            shared.setdefault(t["ref"], []).append(tone_key)
    for ref, names in shared.items():
        if len(names) > 1:  # with Chatterbox they differed by settings; the clone now takes the tone from the sample
            print(f"  note: {', '.join(names)} use the same sample ({ref}) and will sound alike; "
                  "point each to its own sample in tones.json if you want them to differ")

    if not new and not fixed:
        print("\nNothing new to set up. New recordings go in user/voices/raw/ (docs/voice.md); --redo redoes existing tones.")
        return
    if a.dry_run:
        return
    tones_file.write_text(json.dumps(tones, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"\nSaved {tones_file}. Listen to the samples; a whole-video test: a script with "
          f"\"voice\": {{\"engine\": \"qwen\", \"tone\": \"narracao\"}}, then vk build <project> --preview.")


if __name__ == "__main__":
    main()
