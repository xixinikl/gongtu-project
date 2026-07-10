#!/usr/bin/env python3
"""Create a factual project-retrospective candidate from one daily acceptance run."""

from __future__ import annotations

import json
import sys
from pathlib import Path


def load_json(path: Path, default: dict) -> dict:
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else default


def main() -> int:
    if len(sys.argv) != 2:
        print("Usage: render-retrospective-candidate.py YYYY-MM-DD", file=sys.stderr)
        return 2

    date = sys.argv[1]
    out = Path(".agent-factory/out") / date
    scope = load_json(out / "scope.json", {})
    checks = load_json(out / "checks.json", {"results": []})
    risk = load_json(out / "risk.json", {})
    failed = [item for item in checks.get("results", []) if item.get("exitCode") != 0]
    high_risk = risk.get("highRiskFiles", [])
    autofix = risk.get("autofixableFailedChecks", [])

    candidate_path = out / "retrospective-candidate.md"
    if not (failed or high_risk or autofix):
        candidate_path.unlink(missing_ok=True)
        print("No retrospective candidate required for this run.")
        return 0

    verdict = "fail" if failed else "conditional"
    failed_names = ", ".join(str(item.get("name")) for item in failed) or "无"
    high_risk_names = ", ".join(str(item) for item in high_risk) or "无"
    autofix_names = ", ".join(str(item) for item in autofix) or "无"
    text = f"""# {date} 每日验收复盘候选

- 来源：`.agent-factory/out/{date}/daily-report.md`
- 测试提交：`{str(scope.get('testedSha', ''))[:12]}`
- 验收结论：`{verdict}`
- 升级状态：待周检

## 已证实事实

- 失败检查：{failed_names}
- 高风险文件：{high_risk_names}
- 可尝试低风险自动修复：{autofix_names}

## 影响与下一步

- 回到同目录日志和 `daily-report.md` 确认根因；不要依据一次失败补充猜测。
- 周检时确认问题是否重复、是否可用测试/规则/检查防复发。

## 全局经验升级判断

- 默认不升级。只有跨项目有效、可执行且有证据的规则，才能写入个人 Profile 的 `LEARNINGS.md`。
"""
    candidate_path.write_text(text, encoding="utf-8")
    print(f"Wrote {candidate_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
