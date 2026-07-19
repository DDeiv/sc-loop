import numpy as np, json, base64, io, soundfile as sf

SR = 48000
BPM = 75.0
BEAT = 60.0 / BPM
BARS = 2
LOOP = BARS * 4 * BEAT
N = int(round(LOOP * SR))
buf = np.zeros(N)

def add(sig, t):
    i = int(round(t % LOOP * SR)); n = len(sig); end = i + n
    if end <= N: buf[i:end] += sig
    else:
        k = N - i; buf[i:] += sig[:k]; buf[:end - N] += sig[k:]

def env(n, a, d, curve=3.0):
    at = int(a * SR); dt = n - at
    e = np.ones(n)
    if at > 0: e[:at] = np.linspace(0, 1, at)
    if dt > 0: e[at:] = np.exp(-np.linspace(0, curve, dt))
    return e

def kick():
    n = int(0.4 * SR); t = np.arange(n) / SR
    f = 45 + 65 * np.exp(-t / 0.035)
    sig = np.sin(2 * np.pi * np.cumsum(f) / SR)
    return np.tanh(sig * 2.2) * env(n, 0.002, 0.35, 5) * 0.9

def sub(freq, dur):
    n = int(dur * SR); t = np.arange(n) / SR
    sig = np.sin(2 * np.pi * freq * t) + 0.15 * np.sin(4 * np.pi * freq * t)
    return np.tanh(sig * 1.3) * env(n, 0.01, dur, 2.5) * 0.55

def hat(open_=False):
    dur = 0.22 if open_ else 0.055
    n = int(dur * SR)
    rng = np.random.default_rng(7 if open_ else 3)
    noise = rng.normal(0, 1, n)
    noise = np.diff(noise, prepend=0); noise = np.diff(noise, prepend=0)
    noise /= max(np.max(np.abs(noise)), 1e-9)
    return noise * env(n, 0.001, dur, 6) * (0.16 if open_ else 0.13)

def rim():
    n = int(0.14 * SR); t = np.arange(n) / SR
    noise = np.random.default_rng(11).normal(0, 1, n)
    b = np.sin(2 * np.pi * 890 * t) * 0.7 + noise * 0.5
    return b * env(n, 0.001, 0.12, 7) * 0.5

def skank():
    n = int(0.14 * SR); t = np.arange(n) / SR
    chord = sum(np.sin(2 * np.pi * f * t) for f in (220.0, 261.6, 329.6))
    return chord / 3 * env(n, 0.002, 0.12, 6) * 0.4

events = []
for bar in range(BARS):
    b0 = bar * 4
    events += [(b0 + 0, "kick"), (b0 + 2, "kick"), (b0 + 2, "rim")]
    for i in range(8):
        events.append((b0 + i * 0.5, "hat_open" if i == 3 else "hat"))
    events += [(b0 + 1, "skank"), (b0 + 3, "skank")]
bass = [(0, 55.0, 1.4), (2.5, 49.0, 0.4), (3.0, 41.2, 0.9),
        (4, 55.0, 0.9), (5.5, 49.0, 0.4), (6.0, 55.0, 0.4), (6.5, 41.2, 1.2)]
for tb, f, dur_b in bass:
    events.append((tb, "sub", f, dur_b))
DELAY_B = 0.75
for tb in [1, 3, 5, 7]:
    for k in (1, 2, 3):
        events.append((tb + k * DELAY_B, "echo", 0.5 ** k))

for ev in events:
    tb, typ = ev[0], ev[1]; t = tb * BEAT
    if typ == "kick": add(kick(), t)
    elif typ == "rim": add(rim(), t)
    elif typ == "hat": add(hat(), t)
    elif typ == "hat_open": add(hat(True), t)
    elif typ == "skank": add(skank(), t)
    elif typ == "sub": add(sub(ev[2], ev[3] * BEAT), t)
    elif typ == "echo": add(skank() * ev[2], t)

buf /= np.max(np.abs(buf))
buf *= 10 ** (-3 / 20)

bio = io.BytesIO()
sf.write(bio, buf, SR, format="WAV", subtype="PCM_16")
wav_bytes = bio.getvalue()
sf.write("loops/dub_p0.wav", buf, SR, subtype="PCM_16")

sched = []
for ev in sorted(events, key=lambda e: e[0]):
    tb, typ = ev[0], ev[1]
    e = {"t": round(tb * BEAT, 4), "type": "hat" if typ == "hat_open" else typ}
    if typ == "sub": e["freq"] = ev[2]
    if typ == "echo": e["gain"] = round(ev[2], 3)
    sched.append(e)

js = ("const LOOP_LEN = %.4f;\nconst LOOP_BPM = %s;\nconst SCHEDULE = %s;\n"
      "const LOOP_WAV_B64 = \"%s\";\n") % (
    LOOP, BPM, json.dumps(sched), base64.b64encode(wav_bytes).decode())
open("loop_data.js", "w").write(js)
print(f"loop {LOOP:.2f}s, {len(sched)} events, wav {len(wav_bytes)//1024} KB")
