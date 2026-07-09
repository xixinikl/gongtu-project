#!/usr/bin/env python3
"""Render the human-facing Gongtu daily acceptance report."""

from __future__ import annotations

import json
import sys
from pathlib import Path


def load_json(path: Path, default: dict) -> dict:
    if path.exists():
        return json.loads(path.read_text(encoding="utf-8"))
    return default


def bullet(items: list[str], empty: str = "无") -> str:
    return "\n".join(f"- {item}" for item in items) if items else f"- {empty}"


def main() -> int:
    if len(sys.argv) != 2:
        print("Usage: render-human-report.py YYYY-MM-DD", file=sys.stderr)
        return 2

    date = sys.argv[1]
    out = Path(".agent-factory/out") / date
    scope = load_json(out / "scope.json", {})
    checks = load_json(out / "checks.json", {"results": []})
    risk = load_json(out / "risk.json", {})

    results = checks.get("results", [])
    failed = [r for r in results if r.get("exitCode") != 0]
    high_risk = risk.get("highRiskFiles", [])
    if failed:
        verdict = "fail"
        verdict_cn = "不通过"
        verdict_reason = "存在未通过检查，需要修复或人工判断后复跑。"
    elif high_risk:
        verdict = "conditional"
        verdict_cn = "有条件通过"
        verdict_reason = "检查通过，但范围触及高风险文件，需要人工确认风险。"
    else:
        verdict = "pass"
        verdict_cn = "通过"
        verdict_reason = "L0 检查全部通过，未发现高风险变更。"

    check_lines = []
    for r in results:
        ok = "PASS" if r.get("exitCode") == 0 else "FAIL"
        check_lines.append(
            f"{ok} `{r.get('name')}` exit={r.get('exitCode')}，"
            f"日志摘录 `{r.get('excerptPath')}`"
        )

    failed_lines = [
        f"`{r.get('name')}`: exit={r.get('exitCode')}，先看 `{r.get('excerptPath')}`"
        for r in failed
    ]
    uncovered = [
        "浏览器真人路径、桌面端真实启动、AI 批改真实调用不在 L0 每日范围内。",
        "如果这些区域当天有高风险变更，日报只能给 conditional/fail，后续开专项验收。",
    ]
    if not high_risk and not failed:
        uncovered.append("今天未触发 L1/L2 深测条件。")

    text = f"""# 公途每日验收报告 - {date}

## 总结论

- Verdict: `{verdict}`（{verdict_cn}）
- 结论理由: {verdict_reason}
- 验收日期: {date}
- 测试提交: `{str(scope.get('testedSha', ''))[:12]}`
- 基线分支: `{scope.get('baseBranch', 'main')}`
- 基线 SHA: `{str(scope.get('baseSha', ''))[:12]}`
- 建议深度: `{risk.get('recommendedLevel', 'L0')}`
- 报告对象: 这份 `daily-report.md` 给人读；同目录 `codex-summary.md` 给 Codex 低 token 复盘。

## 范围冻结

- 当日提交数: {scope.get('commitCount', 0)}
- 变更文件数: {scope.get('changedFileCount', 0)}
- 工作区状态条目: {len(scope.get('trackedStatus', []))}

## 今天检查了什么

{bullet(check_lines)}

## 失败与影响

{bullet(failed_lines)}

## 高风险变更

{bullet(high_risk)}

## 自动修复建议

{bullet(risk.get('autofixableFailedChecks', []), '今天没有低风险自动修复项')}

## 缺口账本

{bullet(uncovered)}

## 错误复盘入库判断

- 每日流水报告不提交进仓库，只保存在 GitHub Actions artifact。
- 只有重复出现、暴露规则缺口、测试盲区或高风险模块问题，才整理到 `doc/retrospectives/`。
- 低风险 Ruff 问题可由后续 Codex 分支 PR 修复；高风险问题只报告，不直接改 main。

## 给 Codex 的压缩摘要

详见同目录 `codex-summary.md`。Codex 应先读摘要，再按失败项读取日志摘录，避免读取全仓库和完整日志。
"""

    out.mkdir(parents=True, exist_ok=True)
    (out / "daily-report.md").write_text(text, encoding="utf-8")
    print(text)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

