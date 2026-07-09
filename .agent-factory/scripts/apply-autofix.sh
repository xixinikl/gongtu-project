#!/usr/bin/env bash
set -euo pipefail

CONFIG=".agent-factory/config.json"
CHECKS=""
RISK=""
OUT=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --config) CONFIG="${2:-}"; shift 2 ;;
    --checks) CHECKS="${2:-}"; shift 2 ;;
    --risk) RISK="${2:-}"; shift 2 ;;
    --out) OUT="${2:-}"; shift 2 ;;
    *) echo "Unknown argument: $1" >&2; exit 2 ;;
  esac
done

[[ -n "$CHECKS" && -n "$RISK" && -n "$OUT" ]] || {
  echo "apply-autofix requires --checks --risk --out" >&2
  exit 2
}

python3 - "$CONFIG" "$CHECKS" "$RISK" "$OUT" <<'PY'
import json, subprocess, sys, time
from pathlib import Path

config_path, checks_path, risk_path, out_path = sys.argv[1:5]
cfg = json.load(open(config_path))
checks = json.load(open(checks_path))
risk = json.load(open(risk_path))
eligible = set(risk.get("autofixableFailedChecks", []))

by_name = {c["name"]: c for c in checks.get("results", [])}
results = []

for name in sorted(eligible):
    check = by_name.get(name)
    if not check:
        results.append({"name": name, "status": "skipped", "reason": "missing check result"})
        continue
    command = check.get("autofixCommand")
    if not command:
        results.append({"name": name, "status": "skipped", "reason": "missing autofix command"})
        continue

    start = time.time()
    fix = subprocess.run(command, shell=True, text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    verify = subprocess.run(check["command"], shell=True, text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    results.append({
        "name": name,
        "autofixCommand": command,
        "autofixExitCode": fix.returncode,
        "verifyCommand": check["command"],
        "verifyExitCode": verify.returncode,
        "durationSeconds": round(time.time() - start, 2),
        "kept": fix.returncode == 0 and verify.returncode == 0,
        "autofixOutputTail": "\n".join((fix.stdout or "").splitlines()[-80:]),
        "verifyOutputTail": "\n".join((verify.stdout or "").splitlines()[-80:]),
    })

Path(out_path).write_text(json.dumps({
    "attemptedCount": len(results),
    "keptCount": sum(1 for r in results if r.get("kept")),
    "results": results,
}, ensure_ascii=False, indent=2) + "\n")
PY

