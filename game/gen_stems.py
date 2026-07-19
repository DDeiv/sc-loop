"""Stem bank v2: slot variants across 8 genres -> stems_data.js
Slots: kick bass hats snare chords lead fx. All loops 2 bars @ 75 BPM."""
import numpy as np, json, base64, io
import soundfile as sf
from scipy.signal import butter, lfilter

BPM = 75.0; BEAT = 60.0 / BPM; LOOP = 8 * BEAT

def render(pairs, sr):
    n = int(round(LOOP * sr)); buf = np.zeros(n)
    for sig, t in pairs:
        i = int(round((t % LOOP) * sr)); m = len(sig); end = i + m
        if end <= n: buf[i:end] += sig
        else:
            k = n - i; buf[i:] += sig[:k]; buf[:end - n] += sig[k:]
    peak = np.max(np.abs(buf))
    if peak > 0: buf = buf / peak * 10 ** (-4 / 20)
    return buf

def env(n, sr, a, curve=4.0):
    at = max(1, int(a * sr)); e = np.ones(n)
    e[:at] = np.linspace(0, 1, at); e[at:] = np.exp(-np.linspace(0, curve, n - at))
    return e

def lp(sig, sr, cut):
    b, a = butter(2, min(cut, sr / 2 - 100) / (sr / 2)); return lfilter(b, a, sig)
def hpf(sig, sr, cut):
    b, a = butter(2, cut / (sr / 2), btype="high"); return lfilter(b, a, sig)

def kick(sr, drive=2.2, decay=0.35, f0=110, f1=45):
    n = int((decay + 0.1) * sr); t = np.arange(n) / sr
    f = f1 + (f0 - f1) * np.exp(-t / 0.035)
    return np.tanh(np.sin(2 * np.pi * np.cumsum(f) / sr) * drive) * env(n, sr, 0.002, 5)

def sub(sr, freq, dur):
    n = int(dur * sr); t = np.arange(n) / sr
    s = np.sin(2 * np.pi * freq * t) + 0.15 * np.sin(4 * np.pi * freq * t)
    return np.tanh(s * 1.3) * env(n, sr, 0.01, 2.5)

def nz(sr, dur, cut, seed, hpcut=3000):
    n = int(dur * sr)
    x = np.random.default_rng(seed).normal(0, 1, n)
    x = hpf(x, sr, hpcut); x = lp(x, sr, cut)
    m = np.max(np.abs(x)); return (x / m if m > 0 else x) * env(n, sr, 0.001, 6)

def clap(sr):
    n = int(0.23 * sr); out = np.zeros(n)
    for i, (s, g) in enumerate(((21, 0.7), (22, 0.85), (23, 1.0))):
        p = nz(sr, 0.2, 6000, s, 1200) * g
        off = int(i * 0.011 * sr); m = min(len(p), n - off); out[off:off + m] += p[:m]
    return out

def pluck(sr, freq, dur=0.16, bright=6):
    n = int(dur * sr); t = np.arange(n) / sr
    s = sum(np.sin(2 * np.pi * freq * k * t) / k for k in range(1, bright))
    return s / 2 * env(n, sr, 0.002, 7)

def saw(sr, freq, dur, det=0.0):
    n = int(dur * sr); t = np.arange(n) / sr
    s = 2 * ((freq * t) % 1) - 1
    if det: s = s + (2 * (((freq * (1 + det)) * t) % 1) - 1)
    return s

A1, G1, E1, A2 = 55.0, 49.0, 41.2, 110.0
stems = []
E = lambda tb, **kw: dict(t=round(tb * BEAT, 4), **kw)

def stem(id_, slot, name, desc, effect, fx, sr, pairs, events, dmgMul=1.0, p=None):
    audio = render(pairs, sr)
    bio = io.BytesIO(); sf.write(bio, audio, sr, format="WAV", subtype="PCM_16")
    d = dict(id=id_, slot=slot, name=name, desc=desc, effect=effect, fx=fx, sr=sr,
             dmgMul=dmgMul, b64=base64.b64encode(bio.getvalue()).decode(), events=events)
    if p: d["p"] = p
    stems.append(d)
    print(f"{id_:14s} {len(events):3d} ev {bio.getbuffer().nbytes//1024:4d} KB")

# ================= KICKS =================
stem("kick_dub", "kick", "one drop kick", "slow heavy dub kick",
     "heavy shot, beats 1+3", "kick", 16000,
     [(kick(16000) * 0.9, b * BEAT) for b in (0, 2, 4, 6)], [E(b) for b in (0, 2, 4, 6)])
stem("kick_house", "kick", "four on the floor", "kick on every beat",
     "heavy shots every beat", "floor", 16000,
     [(kick(16000, 2.0, 0.25, 100, 50) * 0.85, b * BEAT) for b in range(8)],
     [E(b) for b in range(8)])
stem("kick_techno", "kick", "warehouse kick", "harder, darker four-four",
     "heavy shots, +damage", "floor", 16000,
     [(kick(16000, 3.2, 0.22, 105, 48) * 0.9, b * BEAT) for b in range(8)],
     [E(b) for b in range(8)], dmgMul=1.25)
stem("kick_jungle", "kick", "chopped kick", "syncopated double-time chops",
     "erratic heavy shots", "kick", 16000,
     [(kick(16000, 1.8, 0.16, 120, 55) * 0.8, b * BEAT) for b in (0, 1.5, 2.75, 4, 5.5, 6.75)],
     [E(b) for b in (0, 1.5, 2.75, 4, 5.5, 6.75)], dmgMul=0.8)
stem("kick_half", "kick", "half-time kick", "one massive hit per bar",
     "huge slow shot", "kick", 16000,
     [(kick(16000, 3.5, 0.55, 90, 40) * 0.95, b * BEAT) for b in (0, 4)],
     [E(b) for b in (0, 4)], dmgMul=2.2)
stem("kick_gabber", "kick", "gabber kick", "distorted jackhammer",
     "screen-shaking barrage", "gabber", 16000,
     [(np.tanh(kick(16000, 8, 0.3, 130, 55) * 3) * 0.9, b * 0.5 * BEAT) for b in range(16)],
     [E(b * 0.5) for b in range(16)])
# ================= BASS =================
bl = [(0, A1, 1.4), (2.5, G1, 0.4), (3.0, E1, 0.9), (4, A1, 0.9),
      (5.5, G1, 0.4), (6.0, A1, 0.4), (6.5, E1, 1.2)]
stem("bass_dubsub", "bass", "dub bassline", "deep sub pressure",
     "big shockwaves + knockback", "sub", 16000,
     [(sub(16000, f, d * BEAT) * 0.9, tb * BEAT) for tb, f, d in bl],
     [E(tb, freq=f) for tb, f, d in bl], p={"waveMax": 150})
bh = [E(i * 0.5, freq=(A1 if i % 2 == 0 else A2)) for i in range(16)]
stem("bass_house", "bass", "octave bass", "bouncing octave eighths",
     "rapid small shockwaves", "sub", 16000,
     [(sub(16000, (A1 if i % 2 == 0 else A2), 0.3 * BEAT) * 0.8, i * 0.5 * BEAT) for i in range(16)],
     bh, p={"waveMax": 70})
n16 = int(LOOP * 16000); t16 = np.arange(n16) / 16000
drone = np.sin(2 * np.pi * 48 * t16) * (0.35 + 0.25 * np.clip(np.sin(2 * np.pi * (1 / BEAT) * t16), 0, 1))
stem("bass_rumble", "bass", "sub rumble", "tectonic warehouse drone",
     "damage aura around you", "reese", 16000,
     [(np.tanh(drone * 1.5) * 0.6, 0)], [E(b) for b in range(8)])
acid_pat = [(0, A1, 1), (0.25, A2, 0), (0.75, A1, 0), (1.0, A2, 1), (1.5, G1 * 2, 0),
            (2.0, A1, 1), (2.5, A2, 0), (2.75, A1, 0), (3.25, E1 * 2, 1), (3.5, A2, 0)]
ap, ae = [], []
for bar in (0, 4):
    for tb, f, acc in acid_pat:
        s = saw(24000, f * 2, 0.22 * BEAT)
        s = lp(s, 24000, 3000 if acc else 900)
        s = np.tanh(s * 3) * env(len(s), 24000, 0.003, 5)
        ap.append((s * (1.0 if acc else 0.7), (bar + tb) * BEAT)); ae.append(E(bar + tb, acc=acc))
stem("acid303", "bass", "303 acid line", "squelching resonant acid",
     "piercing pellets", "acid", 24000, ap, ae)
reese = saw(16000, 55, LOOP, 0.012)
reese = lp(reese, 16000, 650) * (0.5 + 0.08 * np.sin(2 * np.pi * 0.31 * t16))
stem("bass_reese", "bass", "reese bass", "detuned saws grinding",
     "damage aura around you", "reese", 16000,
     [(np.tanh(reese * 1.4) * 0.5, 0)], [E(b) for b in range(8)])
wp, we = [], []
for start in (0, 2, 4, 6):
    dn = int(2 * BEAT * 16000); tt = np.arange(dn) / 16000
    lfo = 0.5 + 0.5 * np.sin(2 * np.pi * (1 / BEAT) * tt - np.pi / 2)
    s = np.sin(2 * np.pi * A1 * tt) * lfo
    wp.append((np.tanh(s * 1.6) * env(dn, 16000, 0.02, 1.2) * 0.9, start * BEAT))
    for k in range(4): we.append(E(start + k * 0.5))
stem("wobble", "bass", "wobble bass", "half-time LFO sub",
     "slow massive piercing waves", "wobble", 16000, wp, we)
stem("bass_rolling", "bass", "rolling bass", "offbeat pumping eighths",
     "pulsing shockwaves", "sub", 16000,
     [(sub(16000, A1, 0.4 * BEAT) * 0.85, (b + 0.5) * BEAT) for b in range(8)],
     [E(b + 0.5, freq=A1) for b in range(8)], p={"waveMax": 90})
# ================= HATS =================
stem("hats_offbeat", "hats", "offbeat hats", "skanking dub offbeats",
     "bullets on the offbeat", "hat", 32000,
     [(nz(32000, 0.05, 12000, 3) * 0.5, (b + 0.5) * BEAT) for b in range(8)],
     [E(b + 0.5) for b in range(8)])
hh_p = [(nz(32000, 0.04, 12000, 4) * 0.4, b * BEAT) for b in range(8)]
hh_p += [(nz(32000, 0.2, 13000, 7) * 0.5, (b + 0.5) * BEAT) for b in range(8)]
stem("hats_house", "hats", "open hat groove", "closed on the beat, open off",
     "bullets + offbeat bursts", "hat", 32000, hh_p,
     [E(b * 0.5) for b in range(16)])
stem("hats_16", "hats", "909 sixteenths", "relentless 16th hats",
     "machine-gun stream", "hat16", 32000,
     [(nz(32000, 0.04, 14000, b + 40, 5000) * (0.55 if b % 4 == 0 else 0.4), b * 0.25 * BEAT)
      for b in range(32)], [E(b * 0.25) for b in range(32)])
sh_ev, sh_p = [], []
for i in range(32):
    if i % 8 in (2, 6): continue
    tb = i * 0.25 + (0.07 if i % 2 else 0)
    sh_p.append((nz(32000, 0.045, 13000, i + 60, 4000) * (0.55 if i % 4 == 0 else 0.38), tb * BEAT))
    sh_ev.append(E(tb))
stem("hats_shuffle", "hats", "shuffled hats", "swung jungle 16ths",
     "swerving bullet stream", "hat16", 32000, sh_p, sh_ev)
# ================= SNARE =================
stem("rim_dub", "snare", "rimshot", "cracking rim on the 3",
     "homing missile", "rim", 24000,
     [(nz(24000, 0.14, 5000, 11, 600) * 0.8, b * BEAT) for b in (2, 6)], [E(b) for b in (2, 6)])
stem("clap_house", "snare", "house clap", "clap on 2 and 4",
     "twin homing missiles", "clap", 24000,
     [(clap(24000) * 0.8, b * BEAT) for b in (1, 3, 5, 7)], [E(b) for b in (1, 3, 5, 7)])
am = [(0, "k"), (0.5, "h"), (0.75, "s"), (1.25, "s"), (1.5, "k"), (2.0, "s"),
      (2.5, "h"), (2.75, "k"), (3.0, "s"), (3.5, "s"), (3.75, "h")]
amp_, ame = [], []
for bar in (0, 4):
    for tb, w in am:
        if w == "k": s = kick(24000, 1.8, 0.12, 120, 60) * 0.7
        elif w == "s": s = nz(24000, 0.11, 6500, 13, 900) * 0.75
        else: s = nz(24000, 0.04, 12000, 5) * 0.4
        amp_.append((s, (bar + tb) * BEAT)); ame.append(E(bar + tb))
stem("amen_chops", "snare", "amen break", "the most sampled loop ever, chopped",
     "shrapnel bursts", "amen", 24000, amp_, ame)
sb = nz(24000, 0.35, 4000, 17, 300)
body = np.sin(2 * np.pi * 190 * np.arange(len(sb)) / 24000) * env(len(sb), 24000, 0.002, 6)
stem("snare_big", "snare", "dubstep snare", "cavernous snare on the 3",
     "double-damage homing missile", "rim", 24000,
     [((sb * 0.7 + body * 0.5), b * BEAT) for b in (2, 6)], [E(b) for b in (2, 6)], dmgMul=2.0)
# ================= CHORDS =================
sk = [1, 3, 5, 7]; DLY = 0.75
stem("skank_echo", "chords", "skank + space echo", "offbeat stabs in dub delay",
     "3-way spread + ghost echoes", "skank", 24000,
     [(pluck(24000, f, 0.14) * (0.5 if k else 1.0) * (0.5 ** k), (b + k * DLY) * BEAT)
      for b in sk for k in (0, 1, 2, 3) for f in (220.0, 261.6, 329.6)],
     [E(b + k * DLY, kind=("echo" if k else "hit"), gain=round(0.5 ** k, 3))
      for b in sk for k in (0, 1, 2, 3)])
stem("stab_house", "chords", "organ stab", "M1 organ jabs",
     "wide 5-way spread", "skank", 24000,
     [(sum(pluck(24000, f, 0.18, 8) for f in (220.0, 261.6, 329.6, 440.0)) * 0.5, b * BEAT)
      for b in (1, 2.5, 5, 6.5)],
     [E(b, kind="hit") for b in (1, 2.5, 5, 6.5)], dmgMul=1.2)
pn = int(LOOP * 16000)
padt = np.arange(pn) / 16000
pads = sum(np.sin(2 * np.pi * f * (1 + d) * padt)
           for f in (110.0, 130.8, 164.8, 220.0) for d in (-0.005, 0.005))
fade = np.minimum(1, padt / 1.2) * np.minimum(1, (LOOP - padt) / 1.2)
stem("pad_super", "chords", "supersaw pad", "wall of detuned warmth",
     "shield, absorbs hits", "pad", 16000, [(pads / 8 * fade * 0.6, 0)], [E(0), E(4)])
# ================= LEAD =================
hv, hve = [], []
for start in (0, 4):
    dn = int(1.6 * BEAT * 24000); tt = np.arange(dn) / 24000
    f = 220 * np.exp(-tt / 1.1) + 90
    s = sum(2 * ((np.cumsum(f * (1 + d)) / 24000) % 1) - 1 for d in (-0.015, 0, 0.015))
    s = lp(s, 24000, 2200)
    hv.append((np.tanh(s * 1.6) * env(dn, 24000, 0.01, 2) * 0.7, start * BEAT))
    hve.append(E(start))
stem("hoover", "lead", "hoover", "the mentasm riff, pure menace",
     "huge piercing wave", "wobble", 24000, hv, hve, dmgMul=1.4)
arp_notes = [220.0, 261.6, 329.6, 440.0, 329.6, 261.6, 220.0, 164.8]
stem("arp_trance", "lead", "trance arpeggio", "hands-up 16th arp",
     "homing spark swarm", "trance", 32000,
     [(pluck(32000, arp_notes[i % 8] * 2, 0.12, 8) * 0.5, i * 0.25 * BEAT) for i in range(32)],
     [E(i * 0.25) for i in range(32)])
# ================= FX =================
fn = int(2.4 * 16000); ft = np.arange(fn) / 16000
fallf = 700 * np.exp(-ft / 0.7) + 55
fall = np.sin(2 * np.pi * np.cumsum(fallf) / 16000) * np.exp(-ft / 1.0)
fall += nz(16000, 2.4, 3000, 31, 400) * np.exp(-ft / 0.8) * 0.4
stem("sweep_fall", "fx", "sub drop", "the drop falls out of the sky",
     "giant screen-clearing wave", "bigwave", 16000,
     [(fall * 0.8, 0)], [E(0)], p={"waveMax": 420})
rn = int(LOOP * 16000)
rt = np.arange(rn) / 16000
riser = np.random.default_rng(33).normal(0, 1, rn)
riser = hpf(riser, 16000, 600) * (rt / LOOP) ** 2 * 0.5
risf = 200 + 1000 * (rt / LOOP)
riser += np.sin(2 * np.pi * np.cumsum(risf) / 16000) * (rt / LOOP) * 0.25
stem("riser", "fx", "riser", "tension climbing every bar",
     "giant wave at the loop's peak", "bigwave", 16000,
     [(riser * 0.8, 0)], [E(7.75)], p={"waveMax": 380})

GENRES = [
 dict(id="dub", name="dub", desc="Kingston, 1973", bonus="the roots — echoes run deep",
      palette=dict(kick="kick_dub", bass="bass_dubsub", hats="hats_offbeat",
                   snare="rim_dub", chords="skank_echo"), edges=["house", "jungle", "dubstep"]),
 dict(id="house", name="house", desc="Chicago, 1984", bonus="bullets +50% damage",
      palette=dict(kick="kick_house", bass="bass_house", hats="hats_house",
                   snare="clap_house", chords="stab_house"), edges=["techno", "acid", "trance"]),
 dict(id="techno", name="techno", desc="Detroit, 1987", bonus="+25% projectile speed",
      palette=dict(kick="kick_techno", bass="bass_rumble", hats="hats_16",
                   snare="clap_house"), edges=["acid", "hardcore", "trance"]),
 dict(id="acid", name="acid house", desc="TB-303, 1987", bonus="all shots pierce +1",
      palette=dict(kick="kick_techno", bass="acid303", hats="hats_16",
                   snare="clap_house"), edges=["techno", "trance"]),
 dict(id="jungle", name="jungle", desc="London, 1992", bonus="+20% move speed, more shrapnel",
      palette=dict(kick="kick_jungle", bass="bass_reese", hats="hats_shuffle",
                   snare="amen_chops", chords="skank_echo"), edges=["dubstep", "hardcore"]),
 dict(id="dubstep", name="dubstep", desc="Croydon, 2002", bonus="waves 40% bigger",
      palette=dict(kick="kick_half", bass="wobble", hats="hats_shuffle",
                   snare="snare_big", fx="sweep_fall"), edges=["hardcore", "jungle"]),
 dict(id="hardcore", name="hardcore", desc="Rotterdam, 1992", bonus="kicks +50% damage",
      palette=dict(kick="kick_gabber", bass="bass_rumble", hats="hats_16",
                   snare="clap_house", lead="hoover"), edges=["techno"]),
 dict(id="trance", name="trance", desc="Frankfurt, 1993", bonus="+2 max shield",
      palette=dict(kick="kick_house", bass="bass_rolling", hats="hats_house",
                   snare="clap_house", lead="arp_trance", chords="pad_super",
                   fx="riser"), edges=["hardcore", "techno"]),
]
ERAS = ["1970s", "1980s", "1990s", "2000s"]
BOSS = dict(times=[80, 200, 330], hp=[150, 320, 550])

js = ("const LOOP_LEN = %.4f;\nconst LOOP_BPM = %s;\nconst STEMS = %s;\n"
      "const GENRES = %s;\nconst ERAS = %s;\nconst BOSS_CFG = %s;\n") % (
    LOOP, BPM, json.dumps(stems), json.dumps(GENRES), json.dumps(ERAS), json.dumps(BOSS))
open("stems_data.js", "w").write(js)
print(f"total: {len(js)//1024} KB, {len(stems)} stems")
