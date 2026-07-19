# sc-loop — closed-loop AI sound design with SuperCollider

An LLM writes SuperCollider code, renders it offline (no speakers needed),
"hears" the result through an audio analyzer, and iterates until the sound
matches a target.

    [ goal / target sound ]
            |
            v
    [ LLM writes synths/*.scd ]
            |
            v
    scripts/render.sh   -->  renders/*.wav   (SuperCollider NRT, offline)
            |
            v
    tools/analyze.py    -->  features as JSON (pitch, brightness, envelope...)
    tools/compare.py    -->  diff vs target audio
            |
            v
    [ LLM reads the numbers, edits the code, repeats ]

## Layout

- `synths/` — SuperCollider source files the LLM writes/edits
- `renders/` — rendered wav output
- `targets/` — reference audio to match (record your own sounds here)
- `scripts/render.sh` — render a synth file to wav (macOS + Linux)
- `scripts/nrt_harness.scd` — the NRT plumbing (you shouldn't need to touch it)
- `tools/analyze.py` — wav -> feature report (JSON or human-readable)
- `tools/compare.py` — compare two wavs feature-by-feature
- `CLAUDE.md` — teaches Claude Code how to drive the loop

## Setup (macOS)

1. SuperCollider.app in /Applications
2. `pip3 install -r requirements.txt`

## Usage

    ./scripts/render.sh synths/kick.scd renders/kick.wav 1
    python3 tools/analyze.py renders/kick.wav
    python3 tools/compare.py renders/kick.wav targets/kick_ref.wav

Then open Claude Code in this folder and say e.g. "make a dark metallic
drone, 8 seconds, iterate until the spectral centroid stays under 900 Hz".
CLAUDE.md tells it how to run the loop.

## Synth file convention

A synth file must set `~def` (a SynthDef). Optional: `~events` (score
events) and `~duration` (seconds).

    ~def = SynthDef(\mysound, { |out=0|
        var env = EnvGen.ar(Env.perc(0.01, 1), doneAction: 2);
        Out.ar(out, SinOsc.ar(220) * env ! 2);
    });
    ~events = [ [0.0, [\s_new, \mysound, 1000, 0, 0]] ];  // optional
    ~duration = 1.5;                                       // optional
