"""Pydantic data models for the grading application."""
from pydantic import BaseModel
from typing import Optional


class ScoringPoint(BaseModel):
    point: str
    score: float


class ReferenceAnswer(BaseModel):
    fullText: str
    scoringPoints: list[ScoringPoint]


class Question(BaseModel):
    id: str
    setName: str
    number: int
    title: str
    type: str
    wordLimit: int
    score: float
    questionText: str
    questionRequirement: str
    material: str
    referenceAnswer: ReferenceAnswer


class QuestionListItem(BaseModel):
    """Lightweight question info for list view (no full material)."""
    id: str
    setName: str
    number: int
    title: str
    type: str
    wordLimit: int
    score: float
    questionText: str
    questionRequirement: str


class GradingRequest(BaseModel):
    questionId: str
    studentAnswer: str


class PointScore(BaseModel):
    """One scoring point: the model judges coverage, the system computes points."""
    point: str
    maxScore: float
    hit: str              # 完全 / 部分 / 未覆盖
    score: float


class GradingResult(BaseModel):
    """5-dimension grading result plus a point-based score."""
    dimensions: dict[str, Optional[str]]  # e.g. {"内容完整性": "优秀", ...}
    overallComment: str
    suggestions: list[str]
    # 旧批改记录没有分数，因此以下字段可为空。
    score: Optional[float] = None
    maxScore: Optional[float] = None
    pointScores: Optional[list[PointScore]] = None


class HistoryRecord(BaseModel):
    id: str
    questionId: str
    questionTitle: str
    questionType: str
    setNumber: int
    studentAnswer: str
    wordCount: int
    gradingResult: GradingResult
    createdAt: str


class ChatRequest(BaseModel):
    message: str
    questionId: Optional[str] = None  # 可选：关联题目ID，用于引用题目上下文


class ChatResponse(BaseModel):
    reply: str
    mode: str  # "chat" 或 "grade"


# ─── 错题追踪模型 ──────────────────────────────
class MistakeRecord(BaseModel):
    id: str
    questionId: str
    questionTitle: str
    questionType: str
    studentAnswer: str
    aiReply: str          # 飞扬老师的批改回复
    createdAt: str


class MistakeAnalysis(BaseModel):
    summary: str           # 总体薄弱点分析
    weakDimensions: list[str]  # 薄弱维度列表
    recommendations: list[str]  # 改进建议
    recordsReviewed: int   # 分析的记录数


class ErrorResponse(BaseModel):
    error: str
    detail: Optional[str] = None
    rawText: Optional[str] = None
