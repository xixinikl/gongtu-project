#!/usr/bin/env bash
set -euo pipefail

CONFIG=".agent-factory/config.json"
DATE=""
SUMMARY=""
OUT=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --config) CONFIG="${2:-}"; shift 2 ;;
    --date) DATE="${2:-}"; shift 2 ;;
    --summary) SUMMARY="${2:-}"; shift 2 ;;
    --out) OUT="${2:-}"; shift 2 ;;
    *) echo "Unknown argument: $1" >&2; exit 2 ;;
  esac
done

[[ -n "$DATE" && -n "$SUMMARY" && -n "$OUT" ]] || { echo "render-report requires --date --summary --out" >&2; exit 2; }

python3 - "$CONFIG" "$DATE" "$SUMMARY" "$OUT" <<'PY'
import sys
from pathlib import Path

config_path, date, summary_path, out_path = sys.argv[1:5]
summary = Path(summary_path).read_text()
report = f"""# Daily Acceptance Report - {date}

This report was generated from the machine-first acceptance summary. Codex may
append human analysis, auto-fix evidence, and final verdict below.

{summary}

## Codex Final Analysis

Pending Codex review.
"""
Path(out_path).write_text(report)
PY

