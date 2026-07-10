#!/usr/bin/env python3
"""Render a concise weekly quality review from the published daily-run data."""

from __future__ import annotations

import argparse
import json
import urllib.error
import urllib.request
from collections import Counter
from datetime import datetime, timedelta, timezone
from pathlib import Path


def fetch_json(url: str) -> dict:
    with urllib.request.urlopen(url, timeout=15) as response:
        return json.loads(response.read().decode("utf-8"))


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", required=True)
    parser.add_argument("--date", required=True)
    parser.add_argument("--out", required=True)
    args = parser.parse_args()

    try:
        index = fetch_json(f"{args.base_url.rstrip('/')}/data/index.json")
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as error:
        print(f"Cannot load dashboard index: {error}")
        return 2

    end = datetime.strptime(args.date, "%Y-%m-%d").date()
    start = end - timedelta(days=6)
    entries = [item for item in index.get("runs", []) if start.isoformat() <= item.get("date", "") <= end.isoformat()]
    statuses = Counter(item.get("status", "unknown") for item in entries)
    issue_entries = [item for item in entries if item.get("status") != "pass"]
    candidate_dates = [item.get("date") for item in issue_entries]
    report = f"""# 公途每周质量回顾 - {start.isoformat()} 至 {end.isoformat()}

## 本周结论

- 每日验收次数：{len(entries)}
- 通过：{statuses['pass']}
- 有条件通过：{statuses['conditional']}
- 不通过：{statuses['fail']}
- 失败检查累计：{sum(int(item.get('checkFailed', 0)) for item in entries)}
- 高风险变更累计：{sum(int(item.get('highRiskCount', 0)) for item in entries)}

## 需要复盘的日期

"""
    if candidate_dates:
        report += "\n".join(f"- {date}：请查看质量台对应每日报告与复盘候选。" for date in candidate_dates)
    else:
        report += "- 无：本周没有 conditional/fail 验收记录。"
    report += """

## 经验升级门槛

- 仅将重复出现或高影响、且能转成测试/规则/检查的事项写入项目 `doc/retrospectives/`。
- 仅将跨项目有效、有证据的条目升级到个人 Profile 的 `LEARNINGS.md`。
- 本报告不自动修改产品代码、项目规则或全局偏好。
"""
    output = Path(args.out)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(report, encoding="utf-8")
    print(report)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
