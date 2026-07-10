# 环境说明

## 项目 doctor

`xixi-dev-system runtime prepare --project . && xixi-dev-system doctor --project .`

## Isolated Preview

The project adapter `.xixi-dev-system.json` pins Python 3.11 through `uv` and
keeps preview SQLite data under `.xds/data/<namespace>/`. Start a preview only
through `xixi-dev-system preview start --project .`; it assigns a free localhost
port and never falls back to system Python.

## 首次接手

1. 按 `AGENTS.md` 读取项目规则和状态。
2. 先运行 doctor，只报告环境状态。
3. 将实际依赖、版本、端口和数据服务补充到本文件。
