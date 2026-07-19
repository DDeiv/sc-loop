#!/usr/bin/env bash
# voice.sh - speak an instruction + make a sound, hands the rest to Claude Code
cd "$(dirname "${BASH_SOURCE[0]}")/.."
PY=".venv/bin/python3"; [ -x "$PY" ] || PY="python3"
exec "$PY" tools/voice.py "$@"
