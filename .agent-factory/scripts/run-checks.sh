#!/usr/bin/env bash
set -euo pipefail

CONFIG=".agent-factory/config.json"
OUT=""
LOGS=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --config) CONFIG="${2:-}"; shift 2 ;;
    --out) OUT="${2:-}"; shift 2 ;;
    --logs) LOGS="${2:-}"; shift 2 ;;
    *) echo "Unknown argument: $1" >&2; exit 2 ;;
  esac
done

[[ -n "$OUT" && -n "$LOGS" ]] || { echo "run-checks requires --out and --logs" >&2; exit 2; }
mkdir -p "$LOGS"

python3 - "$CONFIG" "$OUT" "$LOGS" <<'PY'
import json, os, shlex, subprocess, sys, time
from pathlib import Path

config_path, out_path, logs_dir = sys.argv[1:4]
cfg = json.load(open(config_path))
checks = cfg.get("checks", [])
excerpt_lines = int(cfg.get("tokenBudget", {}).get("logExcerptLines", 240))
results = []

for check in checks:
    name = check["name"]
    command = check["command"]
    start = time.time()
    log_path = Path(logs_dir) / f"{name}.log"
    with log_path.open("w") as log:
        log.write(f"$ {command}\n\n")
        proc = subprocess.run(command, shell=True, text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
        log.write(proc.stdout or "")
    duration = round(time.time() - start, 2)
    all_lines = log_path.read_text(errors="replace").splitlines()
    excerpt = "\n".join(all_lines[-excerpt_lines:])
    excerpt_path = Path(logs_dir) / f"{name}.excerpt.log"
    excerpt_path.write_text(excerpt + ("\n" if excerpt else ""))
    results.append({
        "name": name,
        "command": command,
        "exitCode": proc.returncode,
        "durationSeconds": duration,
        "risk": check.get("risk", "medium"),
        "autofixCommand": check.get("autofixCommand"),
        "logPath": str(log_path),
        "excerptPath": str(excerpt_path),
    })

summary = {
    "checkCount": len(results),
    "failedCount": sum(1 for r in results if r["exitCode"] != 0),
    "passedCount": sum(1 for r in results if r["exitCode"] == 0),
    "results": results,
}
Path(out_path).write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n")
PY
