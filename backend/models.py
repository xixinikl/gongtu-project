"""Pydantic models for API request/response schemas."""
from typing import Optional, Literal
from pydantic import BaseModel, Field


# ── Card ──
class CardOut(BaseModel):
    id: str
    deck: str
    title: str
    stars: str = ""
    difficulty: str = ""
    example: str = ""
    solution: str = ""
    answer: str = ""
    variants: str = ""
    blank_steps: Optional[str] = None


# ── Quiz ──
class QuizItemOut(BaseModel):
    id: int
    desc: str
    opts: list[str]
    ans: int
    tip: str


# ── Learning Events ──
class EventIn(BaseModel):
    card_id: str = Field(max_length=100)
    action: Literal['correct', 'wrong', 'mastered', 'reset']
    created_at: Optional[str] = Field(default=None, max_length=30)  # ISO 8601, ignored by server


class SyncIn(BaseModel):
    events: list[EventIn] = Field(min_length=1, max_length=100)


class SyncOut(BaseModel):
    accepted: int


# ── High-frequency vocab ──
class VocabOut(BaseModel):
    word: str
    meaning: str
    category: str
    examples: str = ""
    source: str = ""
    search_url: str = ""


class VocabStateOut(BaseModel):
    word: str
    vocab_source: str = "builtin"
    study_count: int = 0
    forget_count: int = 0
    interval_idx: int = 0
    mastered: int = 0
    favorite: int = 0
    last_study_date: str = ""
    next_review_date: str = ""


class VocabStateUpdateIn(BaseModel):
    word: str = Field(min_length=1, max_length=80)
    vocab_source: str = Field(default="builtin", max_length=80)
    study_count: Optional[int] = Field(default=None, ge=0)
    forget_count: Optional[int] = Field(default=None, ge=0)
    interval_idx: Optional[int] = Field(default=None, ge=0)
    mastered: Optional[int] = Field(default=None, ge=0, le=1)
    favorite: Optional[int] = Field(default=None, ge=0, le=1)
    last_study_date: Optional[str] = Field(default=None, max_length=30)
    next_review_date: Optional[str] = Field(default=None, max_length=30)


class QuestionBankOut(BaseModel):
    id: str
    name: str
    version: str = ""
    description: str = ""
    question_count: int = 0
    logic_fill_count: int = 0
    reading_comprehension_count: int = 0


class VerbalQuestionOut(BaseModel):
    id: str
    bank_id: str
    question_type: str
    source_module: str
    module_sequence: int
    stem: str
    options: dict[str, str]
    answer: Optional[str] = None
    explanation: Optional[str] = None
    related_terms: list[str] = []


class VerbalAttemptIn(BaseModel):
    question_id: str = Field(min_length=1, max_length=80)
    selected_answer: Literal["A", "B", "C", "D"]
    time_spent_seconds: int = Field(default=0, ge=0, le=86400)


class VerbalAttemptOut(BaseModel):
    id: int
    question_id: str
    selected_answer: str
    correct_answer: str
    is_correct: int
    explanation: str = ""
    created_at: str
