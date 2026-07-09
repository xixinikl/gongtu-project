#!/usr/bin/env bash
set -euo pipefail

CONFIG=".agent-factory/config.json"
SCOPE=""
CHECKS=""
OUT=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --config) CONFIG="${2:-}"; shift 2 ;;
    --scope) SCOPE="${2:-}"; shift 2 ;;
    --checks) CHECKS="${2:-}"; shift 2 ;;
    --out) OUT="${2:-}"; shift 2 ;;
    *) echo "Unknown argument: $1" >&2; exit 2 ;;
  esac
done

[[ -n "$SCOPE" && -n "$CHECKS" && -n "$OUT" ]] || { echo "classify-risk requires --scope --checks --out" >&2; exit 2; }

python3 - "$CONFIG" "$SCOPE" "$CHECKS" "$OUT" <<'PY'
import json, re, sys
from pathlib import Path

config_path, scope_path, checks_path, out_path = sys.argv[1:5]
cfg = json.load(open(config_path))
scope = json.load(open(scope_path))
checks = json.load(open(checks_path))
rules = cfg.get("riskRules", {})
patterns = [re.compile(p, re.I) for p in rules.get("highRiskPathPatterns", [])]
low_fix = set(rules.get("lowRiskAutofixChecks", []))
large_threshold = int(cfg.get("tokenBudget", {}).get("largeChangeFileThreshold", 30))

high_risk_files = []
for f in scope.get("changedFiles", []):
    if any(p.search(f) for p in patterns):
        high_risk_files.append(f)

failed = [r for r in checks.get("results", []) if r.get("exitCode") != 0]
autofixable = []
manual = []
for r in failed:
    if r.get("name") in low_fix and r.get("autofixCommand") and not high_risk_files:
        autofixable.append(r["name"])
    else:
        manual.append(r["name"])

reasons = []
level = "L0"
if scope.get("changedFileCount", 0) > large_threshold:
    level = "L1"
    reasons.append(f"changed files exceed threshold: {scope.get('changedFileCount')} > {large_threshold}")
if high_risk_files:
    level = "L1"
    reasons.append("high-risk paths changed")
if failed:
    level = "L1"
    reasons.append("one or more checks failed")

verdict = "pass"
if manual or high_risk_files:
    verdict = "conditional" if not failed else "fail"
elif failed and autofixable:
    verdict = "conditional"

risk = {
    "recommendedLevel": level,
    "verdictBeforeCodex": verdict,
    "reasons": reasons,
    "highRiskFiles": high_risk_files,
    "failedChecks": [r["name"] for r in failed],
    "autofixableFailedChecks": autofixable,
    "manualFailedChecks": manual,
}
Path(out_path).write_text(json.dumps(risk, ensure_ascii=False, indent=2) + "\n")
PY

