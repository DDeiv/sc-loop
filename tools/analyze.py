#!/usr/bin/env python3
"""analyze.py - describe a wav file in numbers an LLM can reason about.

usage: analyze.py file.wav [--json]
"""
import argparse
import json
import sys

import numpy as np
import librosa


def db(x):
    return round(float(20 * np.log10(max(x, 1e-12))), 1)


def analyze(path, n_segments=8):
    y, sr = librosa.load(path, sr=None, mono=True)
    dur = len(y) / sr
    out = {"file": path, "sample_rate": sr, "duration_s": round(dur, 3)}
    if dur == 0 or float(np.max(np.abs(y))) < 1e-6:
        out["silent"] = True
        return out

    # -- level / envelope --------------------------------------------------
    out["peak_dbfs"] = db(float(np.max(np.abs(y))))
    rms = librosa.feature.rms(y=y)[0]
    out["rms_dbfs"] = db(float(np.mean(rms)))
    out["loudness_envelope_dbfs"] = [
        db(float(np.mean(s))) for s in np.array_split(rms, n_segments)
    ]
    out["attack_time_s"] = round(int(np.argmax(np.abs(y))) / sr, 4)

    # -- brightness / timbre ----------------------------------------------
    cent = librosa.feature.spectral_centroid(y=y, sr=sr)[0]
    out["spectral_centroid_hz"] = {
        "mean": round(float(np.mean(cent))),
        "std": round(float(np.std(cent))),
        "segments": [round(float(np.mean(s))) for s in np.array_split(cent, n_segments)],
    }
    rolloff = librosa.feature.spectral_rolloff(y=y, sr=sr, roll_percent=0.85)[0]
    out["spectral_rolloff85_hz"] = round(float(np.mean(rolloff)))
    flat = librosa.feature.spectral_flatness(y=y)[0]
    out["spectral_flatness"] = round(float(np.mean(flat)), 4)  # 0=tonal 1=noisy
    bw = librosa.feature.spectral_bandwidth(y=y, sr=sr)[0]
    out["spectral_bandwidth_hz"] = round(float(np.mean(bw)))
    zcr = librosa.feature.zero_crossing_rate(y)[0]
    out["zero_crossing_rate"] = round(float(np.mean(zcr)), 4)

    # -- pitch -------------------------------------------------------------
    try:
        f0, voiced_flag, _ = librosa.pyin(
            y, fmin=30, fmax=2000, sr=sr, frame_length=4096
        )
        voiced = f0[~np.isnan(f0)]
        if len(voiced) > 0:
            med = float(np.median(voiced))
            out["pitch"] = {
                "median_f0_hz": round(med, 1),
                "note": librosa.hz_to_note(med),
                "voiced_fraction": round(float(np.mean(~np.isnan(f0))), 2),
                "f0_range_hz": [round(float(np.min(voiced)), 1),
                                round(float(np.max(voiced)), 1)],
            }
        else:
            out["pitch"] = {"voiced_fraction": 0.0, "note": None}
    except Exception as e:  # pyin can fail on very short files
        out["pitch"] = {"error": str(e)}

    # -- onsets / rhythm ---------------------------------------------------
    onsets = librosa.onset.onset_detect(y=y, sr=sr, units="time")
    out["onsets"] = {
        "count": int(len(onsets)),
        "times_s": [round(float(t), 3) for t in onsets[:32]],
    }
    return out


def human(r):
    lines = [f"{r['file']}  ({r['duration_s']}s @ {r['sample_rate']}Hz)"]
    if r.get("silent"):
        lines.append("  SILENT - no signal detected")
        return "\n".join(lines)
    lines.append(f"  level: peak {r['peak_dbfs']} dBFS, rms {r['rms_dbfs']} dBFS, "
                 f"attack {r['attack_time_s']}s")
    lines.append(f"  envelope (dBFS): {r['loudness_envelope_dbfs']}")
    c = r["spectral_centroid_hz"]
    lines.append(f"  brightness: centroid {c['mean']} Hz (segments {c['segments']}), "
                 f"rolloff85 {r['spectral_rolloff85_hz']} Hz")
    lines.append(f"  texture: flatness {r['spectral_flatness']} (0=tonal 1=noise), "
                 f"bandwidth {r['spectral_bandwidth_hz']} Hz, zcr {r['zero_crossing_rate']}")
    p = r.get("pitch", {})
    if p.get("note"):
        lines.append(f"  pitch: {p['note']} ({p['median_f0_hz']} Hz), "
                     f"voiced {p['voiced_fraction']*100:.0f}%, "
                     f"range {p['f0_range_hz']} Hz")
    else:
        lines.append("  pitch: unpitched / no stable f0")
    o = r["onsets"]
    lines.append(f"  onsets: {o['count']} at {o['times_s']}")
    return "\n".join(lines)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("file")
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args()
    r = analyze(args.file)
    print(json.dumps(r, indent=2) if args.json else human(r))


if __name__ == "__main__":
    main()
