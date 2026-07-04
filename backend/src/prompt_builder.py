"""Build system/user prompts using feiyang-skill as the single source of truth.

Architecture:
    skill files (SKILL.md + references/*.md) → keyword router → assembled prompt
    ─────────────────────────────────────────────────────────────────
    No hardcoded prompt strings. Every word the AI sees comes from the skill files.
    Modify the skill → system upgrades automatically, zero code changes.
"""
from __future__ import annotations

from pathlib import Path
from src.models import Question

# ─── Paths ────────────────────────────────────────────────────────
SKILL_DIR = Path(__file__).resolve().parent.parent / "data" / "feiyang-skill"
REFERENCES_DIR = SKILL_DIR / "references"

# ─── Keyword → reference file mapping ────────────────────────────
# Order matters: first match wins. More specific patterns before general ones.
ROUTE_TABLE = [
    # (keywords tuple, reference_filename, description)
    (("公文", "通知", "报告", "函", "纪要", "讲话稿", "倡议书", "方案", "建议书", "简报", "公开信", "编者按", "短评", "调研", "汇报", "致辞", "主持词"), "公文模板速查.md"),
    (("概括题", "归纳", "总结", "提炼", "分点", "要点", "找点", "审题", "破题", "分析理解题", "对策题", "大作文", "小题"), "心智模型速查.md"),
    (("备考", "时间", "计划", "安排", "顺序", "考场", "复习", "怎么学", "如何准备"), "决策启发式.md"),
]

# Files always loaded regardless of question
ALWAYS_LOAD = ["背景信息.md", "表达DNA.md"]


def _load(path: Path) -> str:
    """Load a markdown file, return empty string if missing."""
    try:
        return path.read_text(encoding="utf-8")
    except Exception:
        return ""


def _route(user_message: str, question: Question | None) -> list[str]:
    """Determine which reference files to load based on keyword matching.

    Returns list of reference filenames to load.
    """
    text = user_message.lower()
    # Also include question context if available
    if question is not None:
        text += " " + (question.type or "").lower()
        text += " " + (question.title or "").lower()

    to_load = []

    for keywords, filename in ROUTE_TABLE:
        for kw in keywords:
            if kw in text:
                to_load.append(filename)
                break  # matched this group, move to next

    return to_load


def build_system_prompt(user_message: str = "", question: Question | None = None) -> str:
    """Assemble the complete system prompt from skill files.

    Always loads: SKILL.md (base persona + grading standards + chat rules)
                 + 背景信息.md + 表达DNA.md
    Conditionally loads: methodology/公文/strategy reference files based on keywords.
    """
    # 1. Base persona — always loaded
    base = _load(SKILL_DIR / "SKILL.md")

    # 2. Always-load context files
    parts = [base]
    for fname in ALWAYS_LOAD:
        content = _load(REFERENCES_DIR / fname)
        if content:
            parts.append("\n---\n" + content)

    # 3. Keyword-routed references
    routed = _route(user_message, question)
    for fname in routed:
        content = _load(REFERENCES_DIR / fname)
        if content:
            parts.append("\n---\n" + content)

    return "\n".join(parts)


def build_chat_prompt(question: Question | None, user_message: str) -> tuple[str, str]:
    """Build (system_prompt, user_prompt) for chat mode.

    System prompt is dynamically assembled from skill files.
    User prompt includes question context when linked.
    """
    system_prompt = build_system_prompt(user_message, question)

    if question is not None:
        scoring_points_text = "\n".join(
            f"  {i+1}. [{sp.score}分] {sp.point}"
            for i, sp in enumerate(question.referenceAnswer.scoringPoints)
        )
        user_prompt = f"""学生发来消息，并关联了题目「{question.title}」。

## 题目背景
**题型**：{question.type} | **分值**：{question.score}分 | **字数**：≤{question.wordLimit}字
**题目**：{question.questionText}
**要求**：{question.questionRequirement}

## 材料摘要
{question.material}

## 参考答案要点
{question.referenceAnswer.fullText}

**逐要点赋分**：
{scoring_points_text}

## 学生消息
{user_message}

请以飞扬老师的身份回复。如果学生是提交作答请你批改，请批改（不打总分，做5维度诊断+总评+3条建议）。
如果学生是问问题，请基于你的申论知识体系耐心解答。如果只是闲聊，自然回应。"""
    else:
        user_prompt = f"""学生发来消息（未关联具体题目）：

{user_message}

请以飞扬老师的身份自然回复。如果是申论相关问题，基于你的知识体系专业解答；
如果是闲聊，轻松回应。"""

    return system_prompt, user_prompt


def build_grading_prompt(question: Question, student_answer: str) -> tuple[str, str]:
    """Build (system_prompt, user_prompt) for grading mode.

    System prompt includes full grading standards from skill files.
    """
    system_prompt = build_system_prompt("批改评分诊断", question)

    scoring_points_text = "\n".join(
        f"  {i+1}. [{sp.score}分] {sp.point}"
        for i, sp in enumerate(question.referenceAnswer.scoringPoints)
    )

    user_prompt = f"""## 题目信息

**题型**：{question.type}
**分值**：{question.score}分
**字数要求**：不超过{question.wordLimit}字
**题目**：{question.questionText}
**要求**：{question.questionRequirement}

## 材料摘要

{question.material}

## 参考答案（评分标准）

{question.referenceAnswer.fullText}

**逐要点赋分**：
{scoring_points_text}

## 学生作答

{student_answer}

## 请你按照飞扬老师的批改标准，对学生作答进行5维度诊断。只输出JSON。"""

    return system_prompt, user_prompt
