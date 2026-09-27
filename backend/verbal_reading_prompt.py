"""Progressively load the verbal-reading Skill and build grounded prompts."""
from __future__ import annotations

from dataclasses import dataclass
import hashlib
import json
from pathlib import Path
import re


BACKEND_DIR = Path(__file__).resolve().parent
SKILL_DIR = BACKEND_DIR / "data" / "verbal-reading-skill"
SKILL_PATH = SKILL_DIR / "SKILL.md"
METHODOLOGY_PATH = SKILL_DIR / "references" / "methodology.md"
RESPONSE_CONTRACT_PATH = SKILL_DIR / "references" / "response-contract.md"


@dataclass(frozen=True)
class PromptBundle:
    system_prompt: str
    user_prompt: str
    skill_version: str
    skill_hash: str


def _read(path: Path) -> str:
    if not path.is_file():
        raise RuntimeError(f"Required verbal-reading Skill file missing: {path.name}")
    return path.read_text(encoding="utf-8").strip()


def load_diagnosis_skill() -> tuple[str, str, str]:
    """Load only the entry, reading methodology, and diagnosis contract."""
    parts = [_read(SKILL_PATH), _read(METHODOLOGY_PATH), _read(RESPONSE_CONTRACT_PATH)]
    version_match = re.search(r"Skill version:\s*`([^`]+)`", parts[0])
    if not version_match:
        raise RuntimeError("Verbal-reading Skill version is missing")
    content = "\n\n---\n\n".join(parts)
    content_hash = hashlib.sha256(content.encode("utf-8")).hexdigest()
    return content, version_match.group(1), content_hash


def build_diagnosis_prompt(context: dict) -> PromptBundle:
    skill, version, content_hash = load_diagnosis_skill()
    system_prompt = (
        f"{skill}\n\n"
        "你正在执行整套片段阅读诊断。严格以服务端JSON中的事实为准。"
        "只输出一个JSON对象，不要Markdown，不要代码围栏。"
        "每条question_feedback的better_path必须是JSON字符串数组，例如"
        "[\"识别问法\",\"定位重点句\",\"比较选项\"]，绝不能输出为单个字符串。"
        "本阶段没有同类题候选池，因此recommended_question_ids必须为空数组，"
        "不得虚构题号。"
    )
    user_prompt = (
        "请基于以下服务端事实生成诊断。question_feedback只覆盖wrong_questions。\n"
        + json.dumps(context, ensure_ascii=False, separators=(",", ":"))
    )
    return PromptBundle(system_prompt, user_prompt, version, content_hash)


def build_followup_prompt(context: dict, message: str) -> PromptBundle:
    skill, version, content_hash = load_diagnosis_skill()
    system_prompt = (
        f"{skill}\n\n"
        "你正在回答用户围绕一次真实片段阅读练习的追问。"
        "先直接回应问题；涉及题目时必须准确写出用户选择和官方答案，"
        "分开官方依据与方法解释，最后只给一个下次可执行动作。"
        "不要输出JSON，不得虚构历史表现、题号或用户心理。"
    )
    user_prompt = (
        "以下是服务端提供的练习、题目、诊断和最近对话事实：\n"
        + json.dumps(context, ensure_ascii=False, separators=(",", ":"))
        + "\n\n用户本轮追问："
        + message
    )
    return PromptBundle(system_prompt, user_prompt, version, content_hash)
