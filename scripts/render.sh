#!/usr/bin/env bash
# render.sh — render a SuperCollider synth file to wav, offline.
# usage: render.sh input.scd output.wav [duration=4] [samplerate=48000]
set -euo pipefail
IN="${1:?usage: render.sh input.scd output.wav [dur] [sr]}"
OUT="${2:?usage: render.sh input.scd output.wav [dur] [sr]}"
DUR="${3:-4}"
SR="${4:-48000}"
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ -x "/Applications/SuperCollider.app/Contents/MacOS/sclang" ]; then
  SCLANG="/Applications/SuperCollider.app/Contents/MacOS/sclang"
elif command -v sclang >/dev/null 2>&1; then
  SCLANG="sclang"
else
  echo "ERROR: sclang not found (install SuperCollider)" >&2
  exit 1
fi

mkdir -p "$(dirname "$OUT")"
if [ "$(uname)" = "Linux" ]; then export QT_QPA_PLATFORM=offscreen; fi
"$SCLANG" "$DIR/nrt_harness.scd" "$(cd "$(dirname "$IN")" && pwd)/$(basename "$IN")" "$(mkdir -p "$(dirname "$OUT")" && cd "$(dirname "$OUT")" && pwd)/$(basename "$OUT")" "$DUR" "$SR" 2>&1 | grep -Ev '^(compil|NumPrimitives|Found|	)' || true

if [ ! -f "$OUT" ]; then
  echo "ERROR: render failed, no output file" >&2
  exit 1
fi
