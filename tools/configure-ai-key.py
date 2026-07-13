#!/usr/bin/env python3
"""Configure the local DeepSeek key without echoing it or touching Git files."""
from __future__ import annotations

import getpass
import os
from pathlib import Path
import tempfile


PROJECT_ROOT = Path(__file__).resolve().parents[1]
ENV_PATH = PROJECT_ROOT / "backend" / ".env"


def _upsert(lines: list[str], key: str, value: str) -> list[str]:
    prefix = f"{key}="
    result = [line for line in lines if not line.startswith(prefix)]
    result.append(f"{key}={value}")
    return result


def write_local_key(value: str, path: Path = ENV_PATH) -> None:
    key = value.strip()
    if len(key) < 20 or not key.startswith("sk-") or any(char.isspace() for char in key):
        raise ValueError("密钥格式不正确；未写入任何文件")
    existing = path.read_text(encoding="utf-8").splitlines() if path.exists() else []
    lines = _upsert(existing, "DEEPSEEK_API_KEY", key)
    if not any(line.startswith("LLM_BASE_URL=") for line in lines):
        lines.append("LLM_BASE_URL=https://api.deepseek.com")
    if not any(line.startswith("LLM_MODEL=") for line in lines):
        lines.append("LLM_MODEL=deepseek-chat")
    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary = tempfile.mkstemp(prefix=".env.", dir=path.parent, text=True)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
            handle.write("\n".join(lines) + "\n")
        os.chmod(temporary, 0o600)
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def main() -> int:
    print("请先在 DeepSeek 控制台撤销聊天中暴露的旧 Key，并创建新 Key。")
    value = getpass.getpass("请输入新的 DeepSeek Key（输入不会显示）：")
    try:
        write_local_key(value)
    except ValueError as exc:
        print(str(exc))
        return 1
    print(f"已安全写入 {ENV_PATH}；该文件被 Git 忽略。")
    print("请重新启动后端，再运行真实 AI 验收。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
