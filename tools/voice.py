#!/usr/bin/env python3
"""voice.py - vocal front-end for the sc-loop.

Press Enter, speak an instruction, beep, then make the sound with your
mouth. The words become the prompt, the sound becomes targets/latest.wav,
and Claude Code is launched to run the design loop.

usage: voice.py [--no-launch] [--model base]
"""
import argparse
import datetime
import shutil
import subprocess
import sys
import time
from pathlib import Path

import numpy as np

SR = 48000
FRAME = 1024  # samples per analysis block


# ---------------------------------------------------------------- helpers
def rms_db(block):
    r = float(np.sqrt(np.mean(block ** 2)))
    return 20 * np.log10(max(r, 1e-10))


def trim_silence(y, sr, thresh_db=-45.0, pad_s=0.05):
    """Trim leading/trailing silence, keep a little padding."""
    hop = 512
    n = len(y) // hop
    if n == 0:
        return y
    levels = np.array([rms_db(y[i * hop:(i + 1) * hop]) for i in range(n)])
    loud = np.where(levels > thresh_db)[0]
    if len(loud) == 0:
        return y
    pad = int(pad_s * sr)
    start = max(0, loud[0] * hop - pad)
    end = min(len(y), (loud[-1] + 1) * hop + pad)
    return y[start:end]


def record_until_silence(prompt, silence_stop_s=1.2, max_s=30.0,
                         start_thresh_db=-38.0, stop_thresh_db=-42.0):
    """Record mic input; stop after `silence_stop_s` of silence once the
    speaker has started, or at max_s. Returns float32 mono at SR."""
    import sounddevice as sd

    print(prompt)
    blocks = []
    started = [False]
    last_loud = [time.monotonic()]
    t0 = time.monotonic()
    done = [False]

    def cb(indata, frames, tinfo, status):
        block = indata[:, 0].copy()
        blocks.append(block)
        level = rms_db(block)
        now = time.monotonic()
        if not started[0]:
            if level > start_thresh_db:
                started[0] = True
                last_loud[0] = now
        else:
            if level > stop_thresh_db:
                last_loud[0] = now
            elif now - last_loud[0] > silence_stop_s:
                done[0] = True
        if now - t0 > max_s:
            done[0] = True

    with sd.InputStream(samplerate=SR, channels=1, blocksize=FRAME,
                        dtype="float32", callback=cb):
        while not done[0]:
            time.sleep(0.05)

    y = np.concatenate(blocks) if blocks else np.zeros(1, dtype=np.float32)
    return trim_silence(y, SR)


def beep(freq=880, dur=0.15):
    import sounddevice as sd
    t = np.arange(int(SR * dur)) / SR
    tone = (np.sin(2 * np.pi * freq * t) * 0.3).astype(np.float32)
    fade = int(0.01 * SR)
    tone[:fade] *= np.linspace(0, 1, fade)
    tone[-fade:] *= np.linspace(1, 0, fade)
    sd.play(tone, SR)
    sd.wait()


def transcribe(path, model_size):
    from faster_whisper import WhisperModel
    print(f"transcribing ({model_size})...")
    model = WhisperModel(model_size, device="cpu", compute_type="int8")
    segments, _ = model.transcribe(str(path), language=None)
    return " ".join(s.text.strip() for s in segments).strip()


# ---------------------------------------------------------------- main
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--no-launch", action="store_true",
                    help="don't launch claude, just print the prompt")
    ap.add_argument("--model", default="base",
                    help="whisper model: tiny/base/small (default base)")
    args = ap.parse_args()

    import soundfile as sf

    root = Path(__file__).resolve().parent.parent
    targets = root / "targets"
    targets.mkdir(exist_ok=True)

    input(">> Press Enter, then SPEAK your instruction...")
    speech = record_until_silence("listening...")
    if len(speech) < SR * 0.3:
        print("Didn't catch anything. Try again.")
        sys.exit(1)
    tmp = targets / ".instruction.wav"
    sf.write(tmp, speech, SR)

    beep()
    print(">> Now MAKE THE SOUND (beatbox, hum, whatever)...")
    sound = record_until_silence("recording target...",
                                 silence_stop_s=1.0, max_s=15.0)
    beep(freq=440)

    stamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    take = targets / f"take_{stamp}.wav"
    sf.write(take, sound, SR)
    shutil.copy(take, targets / "latest.wav")
    print(f"target saved: {take.relative_to(root)} "
          f"({len(sound)/SR:.2f}s)")

    text = transcribe(tmp, args.model)
    tmp.unlink(missing_ok=True)
    if not text:
        print("Transcription came back empty. Try again.")
        sys.exit(1)
    print(f'you said: "{text}"')

    prompt = (
        f"{text}\n\n"
        f"The target sound I just recorded is targets/latest.wav "
        f"(also saved as {take.name}). Follow CLAUDE.md: design a synth in "
        f"synths/, render it, and iterate with tools/compare.py against the "
        f"target until similarity stops improving. Then tell me which "
        f"render to audition."
    )

    if args.no_launch or shutil.which("claude") is None:
        if shutil.which("claude") is None:
            print("(claude CLI not found in PATH)")
        print("\n--- prompt ---\n" + prompt)
        return

    print("launching Claude Code...\n")
    subprocess.run(["claude", prompt], cwd=root)


if __name__ == "__main__":
    main()
