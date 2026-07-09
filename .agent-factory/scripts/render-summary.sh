#!/usr/bin/env bash
set -euo pipefail

CONFIG=".agent-factory/config.json"
DATE=""
SCOPE=""
CHECKS=""
RISK=""
OUT=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --config) CONFIG="${2:-}"; shift 2 ;;
    --date) DATE="${2:-}"; shift 2 ;;
    --scope) SCOPE="${2:-}"; shift 2 ;;
    --checks) CHECKS="${2:-}"; shift 2 ;;
    --risk) RISK="${2:-}"; shift 2 ;;
    --out) OUT="${2:-}"; shift 2 ;;
    *) echo "Unknown argument: $1" >&2; exit 2 ;;
  esac
done

[[ -n "$DATE" && -n "$SCOPE" && -n "$CHECKS" && -n "$RISK" && -n "$OUT" ]] || {
  echo "render-summary requires --date --scope --checks --risk --out" >&2
  exit 2
}

python3 - "$CONFIG" "$DATE" "$SCOPE" "$CHECKS" "$RISK" "$OUT" <<'PY'
import json, sys
from pathlib import Path

config_path, date, scope_path, checks_path, risk_path, out_path = sys.argv[1:7]
cfg = json.load(open(config_path))
scope = json.load(open(scope_path))
checks = json.load(open(checks_path))
risk = json.load(open(risk_path))

def bullet(items, empty="None"):
    return "\n".join(f"- {x}" for x in items) if items else f"- {empty}"

check_lines = []
for r in checks.get("results", []):
    status = "PASS" if r["exitCode"] == 0 else "FAIL"
    check_lines.append(
        f"{status} `{r['name']}` exit={r['exitCode']} duration={r['durationSeconds']}s excerpt={r['excerptPath']}"
    )

commit_lines = []
for c in scope.get("commits", [])[:30]:
    commit_lines.append(f"`{c['sha'][:8]}` {c['subject']} ({c['author']})")
if scope.get("commitCount", 0) > 30:
    commit_lines.append(f"... {scope['commitCount'] - 30} more commits omitted")

changed_preview = scope.get("changedFiles", [])[:40]
if scope.get("changedFileCount", 0) > 40:
    changed_preview.append(f"... {scope['changedFileCount'] - 40} more files omitted")

text = f"""# Codex Daily Acceptance Summary - {date}

## Read This First

This is the compact input for Codex. Do not read full logs or source files unless
the failed checks or high-risk paths below require it.

## Run Metadata

- Project: {scope.get('projectName')}
- Date: {date}
- Timezone: {scope.get('timezone')}
- Branch: {scope.get('branch')}
- Tested SHA: `{scope.get('testedSha','')[:12]}`
- Base branch: {scope.get('baseBranch')} @ `{scope.get('baseSha','')[:12]}`
- Recommended level: {risk.get('recommendedLevel')}
- Initial verdict: {risk.get('verdictBeforeCodex')}
- Daily token soft limit: {cfg.get('tokenBudget',{}).get('dailySoftLimit', 'unset')}

## Scope

- Commits on target date: {scope.get('commitCount')}
- Changed files: {scope.get('changedFileCount')}
- Tracked status entries: {len(scope.get('trackedStatus', []))}

### Commits

{bullet(commit_lines)}

### Changed Files Preview

{bullet(changed_preview)}

## Checks

{bullet(check_lines)}

## Risk Classification

### Reasons

{bullet(risk.get('reasons', []))}

### High-Risk Files

{bullet(risk.get('highRiskFiles', []))}

### Failed Checks

{bullet(risk.get('failedChecks', []))}

### Auto-Fix Eligible Failed Checks

{bullet(risk.get('autofixableFailedChecks', []))}

### Manual / Escalated Failed Checks

{bullet(risk.get('manualFailedChecks', []))}

## Codex Instructions

1. If there are no failures and no high-risk files, produce a short pass report.
2. If an auto-fix eligible check failed, inspect its excerpt first, then run the
   configured autofix command only if the fix is low-risk and reversible.
3. If manual or high-risk items exist, do not modify code until the user or
   project policy allows it. Report the defect and next action.
4. Do not paste full logs into the final answer. Reference excerpt paths.
"""

Path(out_path).write_text(text)
PY
