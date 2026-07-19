# Untitled beat survivor — game design document

*Working title ideas: Soundsystem, Selecta, 140 BPM, Dubline*
*Status: early concept · v0.1 · July 2026*

## One-line pitch

A minimal 2D survival shooter (Vampire Survivors structure) where your
weapon is an evolving electronic music track: every sonic layer of the
mix is a projectile system, everything fires on the beat, and progression
is a journey through the real history of electronic music genres.

## Fantasy

You are not a soldier, you are a soundsystem. Surviving means building a
track that slaps. A build that sounds good IS a build that fights well.
At the end of a run you export your weapon as an actual piece of music.

## Visual style

Deliberately minimal geometry: player is a triangle, enemies are squares,
projectiles are dots, rings and diamonds. All visual identity comes from
motion, rhythm sync, and color. Cheap to build, distinctive on purpose.

---

## Core loop (one run, ~20-30 min)

1. Start every run in the 1970s with a bare dub setup: sub, one drum,
   heavy echo, ~90 BPM, 4 mixer channels.
2. Squares swarm. All weapon fire is automatic and quantized to the
   music grid. The player only moves (see Open questions for the verb).
3. Enemies drop keyword pickups ("909 hats", "amen break", "303 line",
   "sidechain"). Level-up: pick 1 of 3, Vampire Survivors style.
4. Each keyword is handed to the AI which rewrites the SuperCollider
   patch. The track changes; therefore the weapon changes.
5. The analyzer measures the mix. Your position drifts across the genre
   map. Reaching a genre's sound profile unlocks its node and modifier.
6. Eras advance with survival time: more channels, higher BPM ceiling,
   faster enemies. Difficulty scales with time + BPM, not hand-made levels.
7. You die. The run recap is a listen-back of the track you built, from
   sparse dub intro to the peak where you were overwhelmed. Death is the
   end of the song. Export as wav/share.

## Meta progression (between runs)

The genre map (inspired by Ishkur's Guide to Electronic Music) is the
meta screen. Genres reached at least once stay permanently discovered:

- Discovered nodes are visible on the chart with their lore blurb
  (small music-history education angle for free).
- Some nodes unlock as alternate run starts ("begin in 1988, acid house
  kit, 6 channels").
- Long-term goal: light up the whole history. "I still haven't reached
  footwork" is the retention hook.

---

## The weapon is a mixer

The weapon HUD is a channel mixer. Each sonic layer = one subsystem:

| Channel | Sonic role | Weapon behavior |
|---|---|---|
| Sub bass | bassline | Radial shockwave, knockback, fires with the bass pattern |
| Kick | downbeat | Heavy straight shot on the downbeat |
| Hats | subdivision | Rapid small bullets; 16ths = machine gun, sparse = pistol |
| Clap/snare | backbeat | Homing missiles on beats 2 and 4 |
| Arp/lead | melody | Seeking shots that follow the melody contour |
| Pad | sustain | Shield aura, strength = sustain length |
| Riser/FX | transition | Charge-up screen clear released on the drop |
| Delay send | echo | Ghost copies of projectiles repeating on delay time |
| Reverb send | space | Lingering damage field where shots land |
| Sampler | one-shots | Wildcard slot; behavior derived from the sample's features |

Late game: up to 10 channels firing simultaneously, all on the grid.

### Balance = headroom

A mix has physical limits, and those limits are the balance system:

- Channel level = subsystem power. Mute = holster.
- Total loudness is capped by headroom. Overload the mix and it clips:
  clipping audibly distorts AND makes the weapon misfire.
- Sidechain is a tactical tradeoff: duck the hats to make the kick slam
  harder = trade fire rate for burst damage.
- The analyzer measures all of this from the actual audio. The game
  never trusts the AI's opinion of the sound, only the analyzer's
  numbers. This keeps builds fair and un-cheatable.

Anyone who has touched a DAW already understands this balance system.

---

## Genre map progression

### Eras = raw power axis

Electronic music history is a power curve because production technology
accumulated. Each era reached in a run unlocks:

| Era | Channels | BPM ceiling | Feel |
|---|---|---|---|
| 1970s | 4 | ~100 | Sparse, heavy, echoing (dub, disco) |
| 1980s | 6 | ~130 | Drum machines, sequencers (house, electro, techno) |
| 1990s | 8 | ~170 | Samplers, breakbeats (jungle, hardcore, trance) |
| 2000s+ | 10 | ~180 | DAW era, everything at once (dubstep, hardstyle, footwork) |

Since all fire is quantized, BPM literally is fire rate: the game speeds
up because the music historically did.

### Genre nodes = build identity

Each node's sonic signature is its mechanical modifier:

- Jungle: chopped breaks = erratic burst fire
- Gabber/hardcore: distorted kick = screen-shaking single shots
- Dubstep: half-time wobble = slow massive waves
- Trance: arps and builds = homing swarms + charge meter
- Acid: 303 resonance = piercing sweep beam
- Techno: relentless grid = sustained fire rate bonus

Staying in one lineage = specialist bonuses (depth). Crossing lineages
is legal because hybrid genres really exist; fusion picks unlock the
actual fusion genres (breadth).

### Drift unlock (the key mechanic)

You never click a genre node. Each genre has a target feature profile
(tempo, sub weight, spectral centroid, swing, onset density, flatness).
The analyzer continuously compares your current mix against neighboring
profiles; when your track actually starts sounding like jungle, the
jungle node lights up and becomes claimable. Position on the map is
measured from your real audio, never chosen from a menu.

Design work required: curated feature profiles for ~30 genres.

---

## Technical architecture

Builds directly on the existing sc-loop pipeline in this repo:

1. Combat (real time): game engine plays a pre-rendered loop wav and
   reads a firing schedule JSON (event timestamps + per-event features).
   Fully deterministic, no AI latency in combat.
2. Studio phase (between waves, on level-up): the chosen keyword goes to
   Claude Code / local LLM, which edits the SuperCollider patch
   (synths/*.scd), renders offline (scripts/render.sh), and the analyzer
   (tools/analyze.py) extracts onsets -> firing schedule + features ->
   stats. A few seconds of latency, hidden inside the pickup animation
   or a one-bar transition.
3. Genre detection: compare.py logic pointed at genre feature profiles
   instead of target wavs.
4. Fallback: pre-rendered variation bank for every keyword so the game
   works offline / when the LLM is slow; the LLM path makes each
   player's track unique.

Player never sees code. The AI is the invisible house producer.

## Why this can work as a solo/duo project

- Vampire Survivors proved the structure is buildable by one person:
  no level design, difficulty = time scaling.
- Minimal geometry art = no art pipeline.
- The audio system, normally the expensive part, is the part that
  already exists in this repo.
- Unique hook competitors can't copy trivially: build = actual track,
  shareable as audio.

## Open questions

1. Player verb: pure movement (VS-style) vs mouse aiming vs live-mixing
   mid-combat (riding mutes/levels like a performing DJ). Current lean:
   start with pure movement, prototype live-mixing later.
2. Beat-sync feel: does quantized auto-fire feel powerful or laggy?
   First thing to prototype.
3. Keyword vocabulary: how big, how legible to non-producers?
4. Genre profiles: hand-tuned or extracted from reference tracks?
5. Engine: needs tight audio timing. Candidates: Godot (free, good 2D),
   Love2D, or web (Web Audio API has excellent timing).
6. Name.

## Prototype roadmap

- P0 (feel test): one screen, triangle + squares, one pre-rendered dub
  loop + hand-made firing schedule JSON. Verify beat-synced auto-fire
  feels good. No AI, no progression.
- P1 (the pipeline): wire studio phase to sc-loop; one keyword pickup
  that actually rewrites/re-renders the loop mid-run.
- P2 (progression): 2 eras, ~6 genre nodes, drift detection, death =
  track export.
- P3 (meta): persistent map, alternate starts, share/export polish.

---

## Decisions log

- 2026-07-19: Player verb = pure movement (Vampire Survivors style). Live
  mixing shelved for a later prototype.
- 2026-07-19: Engine = web (Canvas 2D + Web Audio). Sample-accurate audio
  clock, zero install, single-file distribution.
- 2026-07-19: P0 built. Loop is numpy-generated for speed; replace with a
  real SuperCollider render via the sc-loop pipeline in P1.
- 2026-07-19: P1+P2 built in one pass ("full systems" build):
  15 audio stems (gen_stems.py -> stems_data.js), XP gems + level-up card
  choices, stems join the mix loop-synced via Web Audio, 7 genre recipes
  with mechanical bonuses, 4 eras with channel caps, reese aura / wobble
  waves / gabber screenshake / pad shield, death recap, run-mix wav export
  (OfflineAudioContext), persistent genre discovery via localStorage.
  P0 kept in game/p0_backup/. Movement and graphics still placeholder by
  design. Genre detection is recipe-based for now; analyzer-driven drift
  stays the target for the real SC pipeline phase.
