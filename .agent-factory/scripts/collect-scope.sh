#!/usr/bin/env bash
set -euo pipefail

DATE=""
CONFIG=".agent-factory/config.json"
OUT=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --date) DATE="${2:-}"; shift 2 ;;
    --config) CONFIG="${2:-}"; shift 2 ;;
    --out) OUT="${2:-}"; shift 2 ;;
    *) echo "Unknown argument: $1" >&2; exit 2 ;;
  esac
done

[[ -n "$DATE" && -n "$OUT" ]] || { echo "collect-scope requires --date and --out" >&2; exit 2; }

python3 - "$CONFIG" "$DATE" "$OUT" <<'PY'
import json, os, subprocess, sys
from pathlib import Path

config_path, date, out_path = sys.argv[1:4]
cfg = json.load(open(config_path))
default_branch = cfg.get("defaultBranch", "main")

def run(args, ok=False):
    p = subprocess.run(args, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if p.returncode and not ok:
        raise SystemExit(f"command failed: {' '.join(args)}\n{p.stderr}")
    return p.stdout.strip()

def lines(s):
    return [x for x in s.splitlines() if x.strip()]

head = run(["git", "rev-parse", "HEAD"], ok=True)
branch = run(["git", "branch", "--show-current"], ok=True)
origin_ref = f"origin/{default_branch}"
base_sha = run(["git", "rev-parse", "--verify", origin_ref], ok=True) or ""
tracked_status = lines(run(["git", "status", "--short"], ok=True))

commit_rows = lines(run([
    "git", "log", "--format=%cd%x09%H%x09%an%x09%s", "--date=short", "--all"
], ok=True))
commits = []
for row in commit_rows:
    parts = row.split("\t", 3)
    if len(parts) == 4 and parts[0] == date:
        commits.append({
            "date": parts[0],
            "sha": parts[1],
            "author": parts[2],
            "subject": parts[3],
        })

changed = set()
for c in commits:
    files = lines(run(["git", "show", "--name-only", "--format=", c["sha"]], ok=True))
    for f in files:
        if f:
            changed.add(f)

scope = {
    "projectName": cfg.get("projectName", Path.cwd().name),
    "date": date,
    "timezone": cfg.get("timezone", "Asia/Shanghai"),
    "branch": branch,
    "testedSha": head,
    "baseBranch": default_branch,
    "baseSha": base_sha,
    "trackedStatus": tracked_status,
    "commitCount": len(commits),
    "commits": commits[:200],
    "changedFileCount": len(changed),
    "changedFiles": sorted(changed)[:500],
}

Path(out_path).parent.mkdir(parents=True, exist_ok=True)
Path(out_path).write_text(json.dumps(scope, ensure_ascii=False, indent=2) + "\n")
PY
