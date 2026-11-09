"""Qwen3-TTS voice-clone narration. Runs inside py/qwen/.venv (its own torch and transformers pins).

Usage: python tts_qwen.py jobs.json
jobs.json: {"jobs": [{"text": "...", "out": "file.wav", "language": "pt",
                      "ref": "voice sample.wav", "ref_text": "what is said in the sample",
                      "temperature": 0.9, "seed": 1}, ...]}
The sample's transcript (ref_text) lets the model copy the voice from the sample's own words; without it
only the speaker embedding is used, which sounds less like the person.
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import kit  # noqa: E402

kit.setup_env()

import numpy as np  # noqa: E402
import soundfile as sf  # noqa: E402
import torch  # noqa: E402
import torchaudio  # noqa: E402
from qwen_tts import Qwen3TTSModel  # noqa: E402

MODEL = "Qwen/Qwen3-TTS-12Hz-1.7B-Base"
LANGUAGES = {"en": "English", "pt": "Portuguese", "es": "Spanish", "fr": "French", "de": "German", "it": "Italian",
             "ru": "Russian", "ja": "Japanese", "ko": "Korean", "zh": "Chinese"}


def main() -> None:
    spec = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    device = "cuda:0" if torch.cuda.is_available() else "cpu"
    model = Qwen3TTSModel.from_pretrained(MODEL, device_map=device,
                                          dtype=torch.bfloat16 if device != "cpu" else torch.float32,
                                          attn_implementation="sdpa")
    prompts = {}  # one voice prompt per (sample, transcript), reused across scenes
    for job in spec["jobs"]:
        code = (job.get("language") or "en").lower()
        if code not in LANGUAGES:
            raise SystemExit(f"Qwen3-TTS does not speak '{code}' (supported: {', '.join(LANGUAGES)})")
        ref, ref_text = job.get("ref"), job.get("ref_text") or None
        if not ref:
            raise SystemExit("The qwen engine needs a voice sample (a tone in user/voices/tones.json, or \"ref\")")
        if (ref, ref_text) not in prompts:
            prompts[ref, ref_text] = model.create_voice_clone_prompt(
                ref_audio=ref, ref_text=ref_text, x_vector_only_mode=ref_text is None)
        torch.manual_seed(int(job.get("seed", 1)))  # same text + settings -> same take (the build cache relies on it)
        kwargs = {"temperature": float(job["temperature"])} if job.get("temperature") is not None else {}
        wavs, sr = model.generate_voice_clone(text=job["text"], language=LANGUAGES[code],
                                              voice_clone_prompt=prompts[ref, ref_text], **kwargs)
        wav = torch.from_numpy(np.asarray(wavs[0], dtype=np.float32))
        if sr != kit.SAMPLE_RATE:
            wav = torchaudio.functional.resample(wav, sr, kit.SAMPLE_RATE)
        out = Path(job["out"])
        out.parent.mkdir(parents=True, exist_ok=True)
        sf.write(out, wav.numpy(), kit.SAMPLE_RATE)
        print(f"  qwen[{code}]: {out.name}", flush=True)


if __name__ == "__main__":
    main()
