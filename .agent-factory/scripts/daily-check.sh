#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage: daily-check.sh [--date YYYY-MM-DD] [--config .agent-factory/config.json]

Runs the machine-first daily acceptance pass and writes:
  .agent-factory/out/<date>/scope.json
  .agent-factory/out/<date>/checks.json
  .agent-factory/out/<date>/risk.json
  .agent-factory/out/<date>/codex-summary.md
  .agent-factory/out/<date>/report.md
USAGE
}

DATE=""
CONFIG=".agent-factory/config.json"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --date)
      DATE="${2:-}"
      shift 2
      ;;
    --config)
      CONFIG="${2:-}"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

if [[ -z "$DATE" ]]; then
  DATE="$(date +%F)"
fi

if [[ ! -f "$CONFIG" ]]; then
  echo "Missing config: $CONFIG" >&2
  echo "Copy .agent-factory/config.example.json to .agent-factory/config.json first." >&2
  exit 2
fi

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$ROOT"

OUT_DIR="$(python3 - "$CONFIG" "$DATE" <<'PY'
import json, sys
cfg=json.load(open(sys.argv[1]))
print(f"{cfg.get('report',{}).get('outDir','.agent-factory/out')}/{sys.argv[2]}")
PY
)"
mkdir -p "$OUT_DIR/logs"

echo "[daily-check] date=$DATE out=$OUT_DIR"

bash .agent-factory/scripts/collect-scope.sh --date "$DATE" --config "$CONFIG" --out "$OUT_DIR/scope.json"
bash .agent-factory/scripts/run-checks.sh --config "$CONFIG" --out "$OUT_DIR/checks.json" --logs "$OUT_DIR/logs"
bash .agent-factory/scripts/classify-risk.sh --config "$CONFIG" --scope "$OUT_DIR/scope.json" --checks "$OUT_DIR/checks.json" --out "$OUT_DIR/risk.json"
bash .agent-factory/scripts/render-summary.sh --config "$CONFIG" --date "$DATE" --scope "$OUT_DIR/scope.json" --checks "$OUT_DIR/checks.json" --risk "$OUT_DIR/risk.json" --out "$OUT_DIR/codex-summary.md"
bash .agent-factory/scripts/render-report.sh --config "$CONFIG" --date "$DATE" --summary "$OUT_DIR/codex-summary.md" --out "$OUT_DIR/report.md"

echo "[daily-check] wrote $OUT_DIR/codex-summary.md"

