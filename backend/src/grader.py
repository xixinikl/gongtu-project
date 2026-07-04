"""LLM grading module - calls OpenAI-compatible API, parses results."""
from __future__ import annotations
import json
import re
import time
import logging
import os
from openai import OpenAI

from src.models import GradingResult
from src.prompt_builder import build_grading_prompt, build_chat_prompt

logger = logging.getLogger("grader")

# Load config from environment
API_KEY = os.getenv("LLM_API_KEY", "")
BASE_URL = os.getenv("LLM_BASE_URL", "https://api.deepseek.com")
MODEL = os.getenv("LLM_MODEL", "deepseek-chat")
TIMEOUT = int(os.getenv("LLM_TIMEOUT", "30"))


def _extract_json(text: str) -> str:
    """Try to extract JSON from LLM output (may be wrapped in ```json ... ```)."""
    # Try direct parse first
    text = text.strip()
    if text.startswith("{"):
        return text
    # Try ```json ... ``` wrapper
    m = re.search(r'```(?:json)?\s*(\{.*?\})\s*```', text, re.DOTALL)
    if m:
        return m.group(1)
    # Try finding first { ... } block
    m = re.search(r'\{.*\}', text, re.DOTALL)
    if m:
        return m.group(0)
    return text


def _parse_dimensions(raw: dict) -> dict:
    """Ensure dimension keys are correctly mapped."""
    dim_keys = ["内容完整性", "逻辑结构", "语言表达", "对策可行性", "格式规范"]
    result = {}
    for key in dim_keys:
        result[key] = raw.get(key, "N/A")
    return result


def grade(question, student_answer: str) -> GradingResult:
    """Call LLM to grade the student's answer.
    
    Args:
        question: Question object from questions.json
        student_answer: The student's written answer
        
    Returns:
        GradingResult with dimensions, comment, and suggestions
        
    Raises:
        RuntimeError: If LLM fails after 3 retries
        TimeoutError: If LLM times out
    """
    if not API_KEY or API_KEY == "your-api-key-here":
        raise RuntimeError("LLM API key not configured. Set LLM_API_KEY in .env file.")
    
    system_prompt, user_prompt = build_grading_prompt(question, student_answer)
    
    client = OpenAI(api_key=API_KEY, base_url=BASE_URL, timeout=TIMEOUT)
    
    start_time = time.time()
    
    for attempt in range(3):
        try:
            logger.info(f"Grading q={question.id}, attempt={attempt+1}, chars={len(student_answer)}")
            
            response = client.chat.completions.create(
                model=MODEL,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                temperature=0.3,  # Lower temperature for more consistent grading
                max_tokens=1000,
            )
            
            raw_output = response.choices[0].message.content
            elapsed = time.time() - start_time
            logger.info(f"LLM responded in {elapsed:.1f}s, output={len(raw_output)} chars")
            
            # Parse JSON
            json_str = _extract_json(raw_output)
            try:
                data = json.loads(json_str)
            except json.JSONDecodeError:
                if attempt < 2:
                    logger.warning(f"JSON parse failed attempt {attempt+1}, retrying...")
                    continue
                else:
                    # Last attempt failed - return raw text
                    logger.error("JSON parse failed after 3 attempts")
                    return GradingResult(
                        dimensions={},
                        overallComment=f"AI返回格式异常，以下是原始回复：\n\n{raw_output}",
                        suggestions=["请重新提交批改"],
                    )
            
            # Build result
            return GradingResult(
                dimensions=_parse_dimensions(data),
                overallComment=data.get("overallComment", ""),
                suggestions=data.get("suggestions", []),
            )
            
        except Exception as e:
            elapsed = time.time() - start_time
            error_msg = str(e)
            logger.error(f"LLM call failed attempt {attempt+1}: {error_msg}")
            
            if "timeout" in error_msg.lower() or "timed out" in error_msg.lower():
                if attempt >= 2:
                    raise TimeoutError(f"LLM请求超时（{TIMEOUT}秒），已重试3次仍失败") from e
            elif attempt >= 2:
                raise RuntimeError(f"LLM调用失败（已重试3次）: {error_msg}") from e

            time.sleep(2 ** attempt)
    raise RuntimeError("Unreachable")


def call_llm_api(prompt: str, system_prompt: str | None = None) -> str:
    """Generic LLM API call for arbitrary prompts (used by analyze etc.).

    Args:
        prompt: The user message content
        system_prompt: Optional system prompt override

    Returns:
        Raw text response from the LLM

    Raises:
        RuntimeError: If LLM fails
        TimeoutError: If LLM times out
    """
    if not API_KEY or API_KEY == "your-api-key-here":
        raise RuntimeError("LLM API key not configured. Set LLM_API_KEY in .env file.")

    client = OpenAI(api_key=API_KEY, base_url=BASE_URL, timeout=TIMEOUT)

    for attempt in range(3):
        try:
            response = client.chat.completions.create(
                model=MODEL,
                messages=[
                    {"role": "system", "content": system_prompt or "你是一个专业的AI助手。请根据用户要求给出详细、准确的回答。"},
                    {"role": "user", "content": prompt},
                ],
                temperature=0.5,
                max_tokens=2000,
            )
            return response.choices[0].message.content
        except Exception as e:
            error_msg = str(e)
            logger.error(f"call_llm_api failed attempt {attempt+1}: {error_msg}")
            if "timeout" in error_msg.lower() or "timed out" in error_msg.lower():
                if attempt >= 2:
                    raise TimeoutError(f"LLM请求超时（{TIMEOUT}秒）") from e
            elif attempt >= 2:
                raise RuntimeError(f"LLM调用失败: {error_msg}") from e
            time.sleep(2 ** attempt)  # Exponential backoff: 1s, 2s, 4s
    raise RuntimeError("Unreachable")


def chat(question, user_message: str) -> str:
    """Call LLM in conversational mode (飞扬老师角色扮演).
    
    Args:
        question: Question object from questions.json (or None for free chat)
        user_message: The user's message
        
    Returns:
        AI reply string
        
    Raises:
        RuntimeError: If LLM fails after 3 retries
    """
    if not API_KEY or API_KEY == "your-api-key-here":
        raise RuntimeError("LLM API key not configured. Set LLM_API_KEY in .env file.")
    
    system_prompt, user_prompt = build_chat_prompt(question, user_message)
    
    client = OpenAI(api_key=API_KEY, base_url=BASE_URL, timeout=TIMEOUT)
    
    for attempt in range(3):
        try:
            logger.info(f"Chat attempt={attempt+1}, msg_len={len(user_message)}")
            
            response = client.chat.completions.create(
                model=MODEL,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                temperature=0.7,  # Higher temperature for natural conversation
                max_tokens=1500,
            )
            
            reply = response.choices[0].message.content
            logger.info(f"Chat reply: {len(reply)} chars")
            return reply
            
        except Exception as e:
            error_msg = str(e)
            logger.error(f"Chat failed attempt {attempt+1}: {error_msg}")
            
            if "timeout" in error_msg.lower() or "timed out" in error_msg.lower():
                if attempt >= 2:
                    raise TimeoutError(f"LLM请求超时（{TIMEOUT}秒），已重试3次仍失败") from e
            elif attempt >= 2:
                raise RuntimeError(f"LLM调用失败（已重试3次）: {error_msg}") from e

            time.sleep(2 ** attempt)
    raise RuntimeError("Unreachable")
