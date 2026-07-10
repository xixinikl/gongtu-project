#!/usr/bin/env python3
"""Publish daily acceptance output into the static quality dashboard data model."""

from __future__ import annotations

import argparse
import json
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


SCHEMA_VERSION = 1
MAX_HISTORY = 90


def load_json(path: Path, default: Any) -> Any:
    if not path.exists():
        return default
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def fetch_json(url: str) -> Any | None:
    try:
        with urllib.request.urlopen(url, timeout=8) as response:
            if response.status != 200:
                return None
            return json.loads(response.read().decode("utf-8"))
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError):
        return None


def verdict_from(checks: dict[str, Any], risk: dict[str, Any]) -> tuple[str, str]:
    failed = int(checks.get("failedCount", 0) or 0)
    high_risk = risk.get("highRiskFiles", [])
    if failed:
        return "fail", "存在未通过检查，需要修复或人工判断后复跑。"
    if high_risk:
        return "conditional", "检查通过，但范围触及高风险文件，需要人工确认风险。"
    return "pass", "L0 检查全部通过，未发现高风险变更。"


def build_run(date: str, out_dir: Path, run_url: str, artifact_name: str) -> dict[str, Any]:
    scope = load_json(out_dir / "scope.json", {})
    checks = load_json(out_dir / "checks.json", {"results": []})
    risk = load_json(out_dir / "risk.json", {})
    daily_report = (out_dir / "daily-report.md").read_text(encoding="utf-8") if (out_dir / "daily-report.md").exists() else ""
    codex_summary = (out_dir / "codex-summary.md").read_text(encoding="utf-8") if (out_dir / "codex-summary.md").exists() else ""
    retrospective_candidate = (out_dir / "retrospective-candidate.md").read_text(encoding="utf-8") if (out_dir / "retrospective-candidate.md").exists() else ""
    autofix = load_json(out_dir / "autofix.json", {"results": []})
    verdict, verdict_reason = verdict_from(checks, risk)
    results = checks.get("results", [])
    failed_checks = [r for r in results if r.get("exitCode") != 0]
    high_risk_files = risk.get("highRiskFiles", [])

    return {
        "schemaVersion": SCHEMA_VERSION,
        "project": scope.get("projectName", "gongtu-project"),
        "date": date,
        "timezone": scope.get("timezone", "Asia/Shanghai"),
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "source": {
            "branch": scope.get("branch"),
            "testedSha": scope.get("testedSha"),
            "baseBranch": scope.get("baseBranch"),
            "baseSha": scope.get("baseSha"),
            "runUrl": run_url,
            "artifactName": artifact_name,
        },
        "verdict": {
            "status": verdict,
            "reason": verdict_reason,
            "recommendedLevel": risk.get("recommendedLevel", "L0"),
        },
        "scope": {
            "commitCount": scope.get("commitCount", 0),
            "changedFileCount": scope.get("changedFileCount", 0),
            "trackedStatusCount": len(scope.get("trackedStatus", [])),
            "commits": scope.get("commits", [])[:30],
            "changedFiles": scope.get("changedFiles", [])[:80],
        },
        "checks": {
            "total": checks.get("checkCount", len(results)),
            "passed": checks.get("passedCount", 0),
            "failed": checks.get("failedCount", len(failed_checks)),
            "results": results,
        },
        "risk": {
            "reasons": risk.get("reasons", []),
            "highRiskFiles": high_risk_files,
            "failedChecks": risk.get("failedChecks", []),
            "autofixableFailedChecks": risk.get("autofixableFailedChecks", []),
            "manualFailedChecks": risk.get("manualFailedChecks", []),
        },
        "autofix": autofix,
        "reports": {
            "dailyMarkdown": daily_report,
            "codexMarkdown": codex_summary,
            "retrospectiveCandidateMarkdown": retrospective_candidate,
        },
        "retrospective": {
            "shouldStore": bool(retrospective_candidate),
            "reason": "失败、高风险变更或自动修复候选会被保存到本次质量报告，待周检决定是否沉淀为项目复盘。",
            "target": "doc/retrospectives/",
        },
    }


def run_index_entry(run: dict[str, Any]) -> dict[str, Any]:
    return {
        "date": run["date"],
        "status": run["verdict"]["status"],
        "reason": run["verdict"]["reason"],
        "recommendedLevel": run["verdict"]["recommendedLevel"],
        "testedSha": (run["source"].get("testedSha") or "")[:12],
        "runUrl": run["source"].get("runUrl", ""),
        "artifactName": run["source"].get("artifactName", ""),
        "checkTotal": run["checks"]["total"],
        "checkPassed": run["checks"]["passed"],
        "checkFailed": run["checks"]["failed"],
        "highRiskCount": len(run["risk"]["highRiskFiles"]),
        "changedFileCount": run["scope"]["changedFileCount"],
        "commitCount": run["scope"]["commitCount"],
        "path": f"data/runs/{run['date']}.json",
    }


def merge_previous(site_dir: Path, previous_base_url: str) -> list[dict[str, Any]]:
    if not previous_base_url:
        return []
    base = previous_base_url.rstrip("/")
    previous_index = fetch_json(f"{base}/data/index.json")
    if not isinstance(previous_index, dict):
        return []

    entries = previous_index.get("runs", [])
    restored: list[dict[str, Any]] = []
    for entry in entries[:MAX_HISTORY]:
        path = entry.get("path")
        date = entry.get("date")
        if not path or not date:
            continue
        run = fetch_json(f"{base}/{path}")
        if not isinstance(run, dict):
            continue
        write_json(site_dir / "data" / "runs" / f"{date}.json", run)
        restored.append(entry)
    return restored


def build_index(project: str, current: dict[str, Any], previous: list[dict[str, Any]]) -> dict[str, Any]:
    by_date: dict[str, dict[str, Any]] = {entry["date"]: entry for entry in previous if entry.get("date")}
    current_entry = run_index_entry(current)
    by_date[current_entry["date"]] = current_entry
    runs = sorted(by_date.values(), key=lambda entry: entry["date"], reverse=True)[:MAX_HISTORY]
    totals = {
        "runs": len(runs),
        "pass": sum(1 for item in runs if item["status"] == "pass"),
        "conditional": sum(1 for item in runs if item["status"] == "conditional"),
        "fail": sum(1 for item in runs if item["status"] == "fail"),
        "failedChecks": sum(int(item.get("checkFailed", 0)) for item in runs),
        "highRisk": sum(int(item.get("highRiskCount", 0)) for item in runs),
    }
    return {
        "schemaVersion": SCHEMA_VERSION,
        "project": project,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "latestDate": current["date"],
        "totals": totals,
        "runs": runs,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("date")
    parser.add_argument("--out-root", default=".agent-factory/out")
    parser.add_argument("--site-dir", default="quality-dashboard")
    parser.add_argument("--previous-base-url", default="")
    parser.add_argument("--run-url", default="")
    parser.add_argument("--artifact-name", default="")
    args = parser.parse_args()

    out_dir = Path(args.out_root) / args.date
    if not out_dir.exists():
        print(f"Missing acceptance output: {out_dir}", file=sys.stderr)
        return 2

    site_dir = Path(args.site_dir)
    previous_entries = merge_previous(site_dir, args.previous_base_url)
    run = build_run(args.date, out_dir, args.run_url, args.artifact_name)
    write_json(site_dir / "data" / "runs" / f"{args.date}.json", run)
    write_json(site_dir / "data" / "latest.json", run)
    write_json(site_dir / "data" / "index.json", build_index(run["project"], run, previous_entries))
    print(f"Published dashboard data for {args.date} into {site_dir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
