from __future__ import annotations

import json
import os
import re
from typing import Any

import requests

DEFAULT_LLM_BASE_URL = "http://12.216.3.116:8000/v1"
DEFAULT_LLM_MODEL = "/root/.cache/huggingface/Gemma-4-31B-IT-NVFP4"


def localLlmBaseUrl() -> str:
    return (os.getenv("LOCAL_LLM_BASE_URL") or DEFAULT_LLM_BASE_URL).strip().rstrip("/")


def localLlmModel() -> str:
    return (os.getenv("LOCAL_LLM_MODEL") or DEFAULT_LLM_MODEL).strip()


def localLlmEnabled() -> bool:
    raw = (os.getenv("LOCAL_LLM_ENABLED") or "1").strip().lower()
    return raw not in {"0", "false", "no", "off"}


def localLlmTimeoutSeconds() -> float:
    try:
        return max(5.0, float(os.getenv("LOCAL_LLM_TIMEOUT_SECONDS") or "120"))
    except ValueError:
        return 120.0


def chatCompletions(
    messages: list[dict[str, str]],
    *,
    temperature: float = 0.0,
    maxTokens: int = 512,
) -> str:
    url = f"{localLlmBaseUrl()}/chat/completions"
    payload = {
        "model": localLlmModel(),
        "messages": messages,
        "temperature": temperature,
        "max_tokens": maxTokens,
    }
    response = requests.post(url, json=payload, timeout=localLlmTimeoutSeconds())
    response.raise_for_status()
    data = response.json()
    choices = data.get("choices") or []
    if not choices:
        raise RuntimeError("Local LLM returned no choices.")
    message = choices[0].get("message") or {}
    content = message.get("content")
    if not isinstance(content, str) or not content.strip():
        raise RuntimeError("Local LLM returned empty content.")
    return content.strip()


def extractJsonObject(text: str) -> Any:
    cleaned = text.strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned, flags=re.I)
        cleaned = re.sub(r"\s*```$", "", cleaned)
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        match = re.search(r"\{[\s\S]*\}|\[[\s\S]*\]", cleaned)
        if not match:
            raise
        return json.loads(match.group(0))
