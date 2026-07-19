"""Generate all audio stems + event schedules for the game -> stems_data.js
Every keyword pickup is a real audio layer, loop-synced at 75 BPM, 2 bars."""
import numpy as np, json, base64, io
import soundfile as sf
from scipy.signal import butter, lfilter

BPM = 75.0; BEAT = 60.0 / BPM; LOOP = 8 * BEAT  # 6.4 s

def render(events_synth, sr):
    n = int(round(LOOP * sr)); buf = np.zeros(n)
    def add(sig, t):
        i = int(round((t % LOOP) * sr)); m = len(sig); end = i + m
        if end <= n: buf[i:end] += sig
        else:
            k = n - i; buf[i:] += sig[:k]; buf[:end - n] += sig[k:]
    for sig, t in events_synth: add(sig, t)
    peak = np.max(np.abs(buf))
    if peak > 0: buf = buf / peak * 10 ** (-4 / 20)
    return buf

def env(n, sr, a, curve=4.0):
    at = max(1, int(a * sr)); e = np.ones(n)
    e[:at] = np.linspace(0, 1, at)
    e[at:] = np.exp(-np.linspace(0, curve, n - at))
    return e

def lp(sig, sr, cut):
    b, a = butter(2, min(cut, sr / 2 - 100) / (sr / 2)); return lfilter(b, a, sig)
def hp(sig, sr, cut):
    b, a = butter(2, cut / (sr / 2), btype="high"); return lfilter(b, a, sig)

def kick(sr, drive=2.2, decay=0.35, f0=110, f1=45):
    n = int(0.45 * sr); t = np.arange(n) / sr
    f = f1 + (f0 - f1) * np.exp(-t / 0.035)
    s = np.sin(2 * np.pi * np.cumsum(f) / sr)
    return np.tanh(s * drive) * env(n, sr, 0.002, 5)

def sub(sr, freq, dur):
    n = int(dur * sr); t = np.arange(n) / sr
    s = np.sin(2 * np.pi * freq * t) + 0.15 * np.sin(4 * np.pi * freq * t)
    return np.tanh(s * 1.3) * env(n, sr, 0.01, 2.5)

def noiseburst(sr, dur, cut, seed, hpcut=3000):
    n = int(dur * sr)
    x = np.random.default_rng(seed).normal(0, 1, n)
    x = hp(x, sr, hpcut); x = lp(x, sr, cut)
    m = np.max(np.abs(x)); return (x / m if m > 0 else x) * env(n, sr, 0.001, 6)

def clap(sr):
    parts = [noiseburst(sr, 0.2, 6000, s, 1200) * g
             for s, g in ((21, 0.7), (22, 0.85), (23, 1.0))]
    n = int(0.23 * sr); out = np.zeros(n)
    for i, p in enumerate(parts):
        off = int(i * 0.011 * sr); m = min(len(p), n - off); out[off:off + m] += p[:m]
    return out

def pluck(sr, freq, dur=0.16, bright=6):
    n = int(dur * sr); t = np.arange(n) / sr
    s = sum(np.sin(2 * np.pi * freq * k * t) / k for k in range(1, bright))
    return s / 2 * env(n, sr, 0.002, 7)

def saw(sr, freq, dur, detune=0.0):
    n = int(dur * sr); t = np.arange(n) / sr
    s = 2 * ((freq * t) % 1) - 1
    if detune: s = s + (2 * (((freq * (1 + detune)) * t) % 1) - 1)
    return s

A1, G1, E1, A2 = 55.0, 49.0, 41.2, 110.0
stems = []

def stem(id_, name, desc, effect, fx, base, tags, sr, pairs, events):
    audio = render(pairs, sr)
    bio = io.BytesIO(); sf.write(bio, audio, sr, format="WAV", subtype="PCM_16")
    stems.append(dict(id=id_, name=name, desc=desc, effect=effect, fx=fx,
                      base=base, tags=tags, sr=sr,
                      b64=base64.b64encode(bio.getvalue()).decode(),
                      events=events))
    print(f"{id_}: {len(events)} events, {bio.getbuffer().nbytes//1024} KB")

E = lambda tb, **kw: dict(t=round(tb * BEAT, 4), **kw)

# ---- base kit (dub, always on) ----
bl = [(0, A1, 1.4), (2.5, G1, 0.4), (3.0, E1, 0.9), (4, A1, 0.9),
      (5.5, G1, 0.4), (6.0, A1, 0.4), (6.5, E1, 1.2)]
stem("dub_sub", "dub bassline", "deep sub pressure, the foundation",
     "radial shockwaves with knockback", "sub", True, ["dub"], 16000,
     [(sub(16000, f, d * BEAT) * 0.9, tb * BEAT) for tb, f, d in bl],
     [E(tb, freq=f) for tb, f, d in bl])
stem("dub_kick", "one drop kick", "slow heavy kick, beats 1 and 3",
     "heavy shot toward the nearest square", "kick", True, ["dub"], 16000,
     [(kick(16000) * 0.9, b * BEAT) for b in (0, 2, 4, 6)],
     [E(b) for b in (0, 2, 4, 6)])
stem("dub_hats", "offbeat hats", "skanking offbeat hats",
     "small bullets on the offbeat", "hat", True, ["dub"], 32000,
     [(noiseburst(32000, 0.05, 12000, 3) * 0.5, (b + 0.5) * BEAT) for b in range(8)],
     [E(b + 0.5) for b in range(8)])

# ---- pickups ----
sk = [1, 3, 5, 7]; DLY = 0.75
stem("skank_echo", "skank + space echo", "offbeat chord stabs drenched in dub delay",
     "3-way spread, echoes fire ghost copies", "skank", False, ["dub"], 24000,
     [(pluck(24000, f, 0.14) * (0.5 if k else 1.0) * (0.5 ** k), (b + k * DLY) * BEAT)
      for b in sk for k in (0, 1, 2, 3) for f in (220.0, 261.6, 329.6)],
     [E(b + k * DLY, kind=("echo" if k else "hit"), gain=round(0.5 ** k, 3))
      for b in sk for k in (0, 1, 2, 3)])
stem("rim_snare", "rimshot", "cracking rim on the 3",
     "homing missile", "rim", False, ["dub"], 24000,
     [(noiseburst(24000, 0.14, 5000, 11, 600) * 0.8, b * BEAT) for b in (2, 6)],
     [E(b) for b in (2, 6)])
stem("clap24", "house clap", "clap on 2 and 4, hands in the air",
     "twin homing missiles", "clap", False, ["house"], 24000,
     [(clap(24000) * 0.8, b * BEAT) for b in (1, 3, 5, 7)],
     [E(b) for b in (1, 3, 5, 7)])
stem("four_floor", "four on the floor", "kick on every beat, the great equalizer",
     "heavy shots on every beat", "floor", False, ["house", "techno"], 16000,
     [(kick(16000, 2.0, 0.25, 100, 50) * 0.85, b * BEAT) for b in range(8)],
     [E(b) for b in range(8)])
stem("hats909", "909 sixteenths", "relentless 16th-note hats",
     "machine-gun bullet stream", "hat16", False, ["techno", "house"], 32000,
     [(noiseburst(32000, 0.04, 14000, b + 40, 5000) * (0.55 if b % 4 == 0 else 0.4),
       b * 0.25 * BEAT) for b in range(32)],
     [E(b * 0.25) for b in range(32)])
acid_pat = [(0, A1, 1), (0.25, A2, 0), (0.75, A1, 0), (1.0, A2, 1), (1.5, G1 * 2, 0),
            (2.0, A1, 1), (2.5, A2, 0), (2.75, A1, 0), (3.25, E1 * 2, 1), (3.5, A2, 0)]
acid_pairs, acid_ev = [], []
for bar in (0, 4):
    for tb, f, acc in acid_pat:
        d = 0.22 * BEAT; s = saw(24000, f * 2, d)
        s = lp(s, 24000, 3000 if acc else 900)
        s = np.tanh(s * 3) * env(int(len(s)), 24000, 0.003, 5)
        acid_pairs.append((s * (1.0 if acc else 0.7), (bar + tb) * BEAT))
        acid_ev.append(E(bar + tb, acc=acc))
stem("acid303", "303 acid line", "squelching resonant acid bass",
     "piercing pellets, accents pierce deeper", "acid", False, ["acid", "techno"],
     24000, acid_pairs, acid_ev)
am = [(0, "k"), (0.5, "h"), (0.75, "s"), (1.25, "s"), (1.5, "k"), (2.0, "s"),
      (2.5, "h"), (2.75, "k"), (3.0, "s"), (3.5, "s"), (3.75, "h")]
amen_pairs, amen_ev = [], []
for bar in (0, 4):
    for tb, w in am:
        if w == "k": s_ = kick(24000, 1.8, 0.12, 120, 60) * 0.7
        elif w == "s": s_ = noiseburst(24000, 0.11, 6500, 13, 900) * 0.75
        else: s_ = noiseburst(24000, 0.04, 12000, 5) * 0.4
        amen_pairs.append((s_, (bar + tb) * BEAT))
        amen_ev.append(E(bar + tb, drum=w))
stem("amen", "amen break", "the most sampled drum loop in history, chopped",
     "erratic shrapnel bursts", "amen", False, ["jungle"], 24000, amen_pairs, amen_ev)
n = int(LOOP * 16000); t = np.arange(n) / 16000
reese = saw(16000, 55, LOOP, 0.012)
reese = lp(reese, 16000, 400 + 250 * np.mean(1)) * (0.5 + 0.08 * np.sin(2 * np.pi * 0.31 * t))
stem("reese", "reese bass", "two detuned saws grinding, dark dnb pressure",
     "damage aura around the player", "reese", False, ["jungle", "dnb"], 16000,
     [(np.tanh(reese * 1.4) * 0.5, 0)], [E(b) for b in range(8)])
wob_pairs, wob_ev = [], []
for start in (0, 2, 4, 6):
    dn = int(2 * BEAT * 16000); tt = np.arange(dn) / 16000
    lfo = 0.5 + 0.5 * np.sin(2 * np.pi * (2 / BEAT / 2) * tt - np.pi / 2)
    s_ = np.sin(2 * np.pi * A1 * tt) * lfo
    wob_pairs.append((np.tanh(s_ * 1.6) * env(dn, 16000, 0.02, 1.2) * 0.9, start * BEAT))
    for k in range(4): wob_ev.append(E(start + k * 0.5))
stem("wobble", "wobble bass", "half-time LFO sub, heavyweight",
     "slow massive waves that pierce everything", "wobble", False, ["dubstep"],
     16000, wob_pairs, wob_ev)
stem("gabber", "gabber kick", "distorted kick jackhammer",
     "screen-shaking shots, huge damage", "gabber", False, ["hardcore"], 16000,
     [(np.tanh(kick(16000, 8, 0.3, 130, 55) * 3) * 0.9, b * 0.5 * BEAT)
      for b in range(16)],
     [E(b * 0.5) for b in range(16)])
arp_notes = [220.0, 261.6, 329.6, 440.0, 329.6, 261.6, 220.0, 164.8]
stem("trance_arp", "trance arpeggio", "hands-up 16th arp, pure euphoria",
     "swarm of tiny homing sparks", "trance", False, ["trance"], 32000,
     [(pluck(32000, arp_notes[i % 8] * 2, 0.12, 8) * 0.5, i * 0.25 * BEAT)
      for i in range(32)],
     [E(i * 0.25) for i in range(32)])
n = int(LOOP * 16000); t = np.arange(n) / 16000
pad = sum(np.sin(2 * np.pi * f * (1 + d) * t)
          for f in (110.0, 130.8, 164.8, 220.0) for d in (-0.004, 0.004))
fade = np.minimum(1, t / 1.2) * np.minimum(1, (LOOP - t) / 1.2)
stem("pad", "warm pad", "sustained chord bed, glue for the mix",
     "shield that absorbs one hit per bar", "pad", False, ["trance", "ambient"],
     16000, [(pad / 8 * fade * 0.6, 0)], [E(0), E(4)])

genres = [
  dict(id="house", name="house", recipe=["four_floor", "clap24"],
       bonus="bullets deal +50% damage", desc="Chicago, 1984"),
  dict(id="techno", name="techno", recipe=["four_floor", "hats909"],
       bonus="+25% projectile speed", desc="Detroit, 1987"),
  dict(id="acid", name="acid house", recipe=["acid303", "hats909"],
       bonus="all shots pierce +1", desc="TB-303, 1987"),
  dict(id="jungle", name="jungle", recipe=["amen", "reese"],
       bonus="+20% move speed", desc="London, 1992"),
  dict(id="dubstep", name="dubstep", recipe=["wobble", "rim_snare"],
       bonus="waves 40% bigger", desc="Croydon, 2002"),
  dict(id="hardcore", name="hardcore", recipe=["gabber", "hats909"],
       bonus="kicks deal +50% damage", desc="Rotterdam, 1992"),
  dict(id="trance", name="trance", recipe=["trance_arp", "pad"],
       bonus="+2 max shield", desc="Frankfurt, 1993"),
]
eras = [dict(name="1970s", cap=4, at=0), dict(name="1980s", cap=6, at=3),
        dict(name="1990s", cap=8, at=6), dict(name="2000s", cap=10, at=9)]

js = ("const LOOP_LEN = %.4f;\nconst LOOP_BPM = %s;\nconst STEMS = %s;\n"
      "const GENRES = %s;\nconst ERAS = %s;\n") % (
    LOOP, BPM, json.dumps(stems), json.dumps(genres), json.dumps(eras))
open("stems_data.js", "w").write(js)
print(f"total js: {len(js) // 1024} KB, {len(stems)} stems")
