"""Background music with ACE-Step 1.5 (MIT, local). Runs inside tools/ACE-Step-1.5/.venv.

Usage: python music_ace.py job.json
job.json: {"caption": "warm acoustic ...", "duration": 62, "bpm": 85, "out": "path.wav",
           "seeds": [1, 2], "model": "acestep-v15-turbo", "lm": "acestep-5Hz-lm-1.7B",
           "thinking": true, "steps": 8, "fade_in": 0.5, "fade_out": 2.5}
Writes one file per seed: <out stem>_s<seed>.wav (always instrumental).
"""
import json
import os
import shutil
import sys
import time
from pathlib import Path

ACE = Path(__file__).resolve().parent.parent / "tools" / "ACE-Step-1.5"
sys.path.insert(0, str(ACE))
os.chdir(ACE)

sys.path.insert(0, str(Path(__file__).resolve().parent))
import kit  # noqa: E402

kit.setup_env()

from acestep.handler import AceStepHandler  # noqa: E402
from acestep.inference import GenerationConfig, GenerationParams, generate_music  # noqa: E402
from acestep.llm_inference import LLMHandler  # noqa: E402


def main() -> None:
    job = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    out = Path(job["out"])
    out.parent.mkdir(parents=True, exist_ok=True)

    t0 = time.time()
    dit = AceStepHandler()
    msg, ok = dit.initialize_service(project_root=str(ACE), config_path=job.get("model", "acestep-v15-turbo"),
                                     device="cuda", offload_to_cpu=False)
    if not ok:
        raise SystemExit(f"DiT init failed: {msg}")
    llm = None
    if job.get("thinking", True) and job.get("lm"):
        llm = LLMHandler()
        msg, ok = llm.initialize(checkpoint_dir=str(ACE / "checkpoints"), lm_model_path=job["lm"], backend="pt",
                                 device="cuda", offload_to_cpu=False, dtype=None)
        if not ok:
            print(f"  LM unavailable ({msg}); generating without it", flush=True)
            llm = None
    print(f"  models ready in {time.time() - t0:.0f}s", flush=True)

    tmp = out.parent / "_ace"
    for seed in job.get("seeds", [1]):
        params = GenerationParams(
            task_type="text2music",
            caption=job["caption"],
            lyrics="[Instrumental]",
            instrumental=True,
            bpm=job.get("bpm"),
            keyscale=job.get("key", ""),
            duration=float(job["duration"]),
            inference_steps=int(job.get("steps", 8)),
            seed=int(seed),
            thinking=llm is not None,
            fade_in_duration=float(job.get("fade_in", 0.5)),
            fade_out_duration=float(job.get("fade_out", 2.5)),
        )
        config = GenerationConfig(batch_size=1, use_random_seed=False, seeds=[int(seed)], audio_format="wav")
        t1 = time.time()
        res = generate_music(dit, llm, params=params, config=config, save_dir=str(tmp))
        if not res.success or not res.audios:
            raise SystemExit(f"Generation failed (seed {seed}): {res.error or res.status_message}")
        target = out.with_name(f"{out.stem}_s{seed}.wav")
        shutil.move(res.audios[0]["path"], target)
        print(f"  music: {target.name} ({time.time() - t1:.0f}s)", flush=True)
    shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    main()
