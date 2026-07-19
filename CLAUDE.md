# sc-loop: how to drive the sound design loop

You are working in a closed-loop SuperCollider sound design environment.
You can render code offline and READ what it sounds like. Never claim a
sound is right without checking the analyzer output.

## The loop

1. Write or edit a synth file in `synths/<name>.scd`.
   Convention: the file MUST set `~def` (a SynthDef). Optional:
   `~events` = [[time, oscMsg], ...] and `~duration` (seconds).
   The SynthDef should free itself (doneAction: 2) or be short-lived.
2. Render:  `./scripts/render.sh synths/<name>.scd renders/<name>.wav <dur>`
   - "RENDER OK" = success. Anything else: read the error, fix the code.
3. Listen with numbers:  `python3 tools/analyze.py renders/<name>.wav`
   - If matching a target: `python3 tools/compare.py renders/<name>.wav targets/<ref>.wav`
4. Interpret and iterate:
   - centroid high = bright/harsh, low = dark/muffled
   - flatness near 0 = tonal, near 1 = noisy
   - attack_time = how percussive the onset is
   - loudness_envelope shows the amp shape over time
   - compare.py prints hints about which direction to adjust
5. Stop when the analysis matches the goal (or similarity_pct stops
   improving for 3 iterations - then show the user your best result and
   what's still off).

## Rules

- One synth per file. Small, labeled parameter changes between iterations
  so cause and effect stay clear.
- Always renormalize levels: keep peak between -6 and -1 dBFS.
- If a render is SILENT, the usual causes: envelope gate never opened,
  doneAction freed the synth instantly, Out.ar bus wrong, or amp = 0.
- sclang gotchas: no multiline comments inside SynthDefs with /* */ nesting,
  arguments need | | or arg syntax, .ar/.kr matter - audio-rate UGens
  can't take .kr-only inputs.
- The user listens with ears too. After 2-3 good iterations, tell them
  which render to audition and wait for feedback before over-optimizing.

## Python

If `.venv/` exists in the project root, use `.venv/bin/python3` instead of
`python3` for the analyze/compare tools.
