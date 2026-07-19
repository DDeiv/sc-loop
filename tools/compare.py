#!/usr/bin/env python3
"""compare.py - compare a rendered wav against a target wav, feature by
feature, with hints about which direction to adjust.

usage: compare.py rendered.wav target.wav [--json]
"""
import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from analyze import analyze


def pct(a, b):
    if b == 0:
        return None
    return round(100 * (a - b) / abs(b), 1)


def compare(rendered, target):
    r, t = analyze(rendered), analyze(target)
    if r.get("silent"):
        return {"error": "rendered file is silent"}
    if t.get("silent"):
        return {"error": "target file is silent"}

    diff = {"rendered": rendered, "target": target, "features": {}}

    def add(name, rv, tv, unit="", hint_high="", hint_low=""):
        d = round(rv - tv, 3)
        entry = {"rendered": rv, "target": tv, "diff": d, "unit": unit}
        p = pct(rv, tv)
        if p is not None:
            entry["diff_pct"] = p
        if d > 0 and hint_high:
            entry["hint"] = hint_high
        elif d < 0 and hint_low:
            entry["hint"] = hint_low
        diff["features"][name] = entry

    add("duration_s", r["duration_s"], t["duration_s"], "s")
    add("rms_dbfs", r["rms_dbfs"], t["rms_dbfs"], "dB",
        "rendered is louder - lower amp", "rendered is quieter - raise amp")
    add("attack_time_s", r["attack_time_s"], t["attack_time_s"], "s",
        "attack too slow - shorten attack", "attack too fast - lengthen attack")
    add("spectral_centroid_hz",
        r["spectral_centroid_hz"]["mean"], t["spectral_centroid_hz"]["mean"], "Hz",
        "too bright - lower filter cutoff / darker waveform",
        "too dark - raise cutoff / add harmonics")
    add("spectral_flatness", r["spectral_flatness"], t["spectral_flatness"], "",
        "too noisy - reduce noise component / more tonal",
        "too tonal - add noise / distortion")
    add("spectral_bandwidth_hz",
        r["spectral_bandwidth_hz"], t["spectral_bandwidth_hz"], "Hz",
        "spectrum too wide", "spectrum too narrow")

    rp, tp = r.get("pitch", {}), t.get("pitch", {})
    if rp.get("median_f0_hz") and tp.get("median_f0_hz"):
        add("median_f0_hz", rp["median_f0_hz"], tp["median_f0_hz"], "Hz",
            "pitch too high - lower freq", "pitch too low - raise freq")
    elif tp.get("note") and not rp.get("note"):
        diff["features"]["pitch"] = {
            "hint": f"target is pitched ({tp['note']}) but render has no stable pitch"}
    add("onset_count", r["onsets"]["count"], t["onsets"]["count"], "",
        "too many hits/attacks", "too few hits/attacks")

    # crude overall similarity score (0-100) from key normalized diffs
    keys = ["rms_dbfs", "spectral_centroid_hz", "spectral_flatness", "attack_time_s"]
    errs = []
    for k in keys:
        f = diff["features"].get(k)
        if f and f.get("diff_pct") is not None:
            errs.append(min(abs(f["diff_pct"]), 100) / 100)
    if errs:
        diff["similarity_pct"] = round(100 * (1 - sum(errs) / len(errs)), 1)
    return diff


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("rendered")
    ap.add_argument("target")
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args()
    d = compare(args.rendered, args.target)
    if args.json or "error" in d:
        print(json.dumps(d, indent=2))
        return
    print(f"rendered: {d['rendered']}\ntarget:   {d['target']}")
    if "similarity_pct" in d:
        print(f"similarity: {d['similarity_pct']}%")
    for k, f in d["features"].items():
        line = f"  {k}: {f.get('rendered')} vs {f.get('target')}"
        if "diff" in f:
            line += f"  (diff {f['diff']}{f.get('unit','')}"
            if "diff_pct" in f:
                line += f", {f['diff_pct']}%"
            line += ")"
        if "hint" in f:
            line += f"  <- {f['hint']}"
        print(line)


if __name__ == "__main__":
    main()
