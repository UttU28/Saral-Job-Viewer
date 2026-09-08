from __future__ import annotations

import json
import os
import re
from typing import Any, Literal

import requests

DEFAULT_LLM_BASE_URL = "http://12.216.3.116:8000/v1"
DEFAULT_LLM_MODEL = "/root/.cache/huggingface/Gemma-4-31B-IT-NVFP4"
DEFAULT_OPENAI_BASE_URL = "https://api.openai.com/v1"
DEFAULT_OPENAI_MODEL = "gpt-4o-mini"

LlmProvider = Literal["local", "openai"]
ClassifyProvider = Literal["local", "openai", "regex"]


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


def localLlmApiKey() -> str:
    key = (os.getenv("LOCAL_LLM_API_KEY") or "").strip()
    if not key or key.lower() in {"not-needed", "none", "n/a"}:
        return ""
    return key


def openaiApiKey() -> str:
    key = (os.getenv("OPENAI_API_KEY") or "").strip().strip('"').strip("'")
    return key


def openaiEnabled() -> bool:
    return bool(openaiApiKey())


def openaiModel() -> str:
    return (os.getenv("OPENAI_MODEL") or DEFAULT_OPENAI_MODEL).strip()


def openaiBaseUrl() -> str:
    return (os.getenv("OPENAI_BASE_URL") or DEFAULT_OPENAI_BASE_URL).strip().rstrip("/")


def openaiTimeoutSeconds() -> float:
    try:
        return max(5.0, float(os.getenv("OPENAI_TIMEOUT_SECONDS") or "60"))
    except ValueError:
        return 60.0


def _headersFor(provider: LlmProvider) -> dict[str, str]:
    headers = {"Content-Type": "application/json"}
    if provider == "openai":
        key = openaiApiKey()
        if key:
            headers["Authorization"] = f"Bearer {key}"
        return headers
    localKey = localLlmApiKey()
    if localKey:
        headers["Authorization"] = f"Bearer {localKey}"
    return headers


def chatCompletions(
    messages: list[dict[str, str]],
    *,
    temperature: float = 0.0,
    maxTokens: int = 512,
    provider: LlmProvider = "local",
) -> str:
    if provider == "openai":
        if not openaiEnabled():
            raise RuntimeError("OpenAI API key is not configured.")
        url = f"{openaiBaseUrl()}/chat/completions"
        model = openaiModel()
        timeout = openaiTimeoutSeconds()
    else:
        url = f"{localLlmBaseUrl()}/chat/completions"
        model = localLlmModel()
        timeout = localLlmTimeoutSeconds()

    payload = {
        "model": model,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": maxTokens,
    }
    response = requests.post(url, json=payload, headers=_headersFor(provider), timeout=timeout)
    response.raise_for_status()
    data = response.json()
    choices = data.get("choices") or []
    if not choices:
        raise RuntimeError(f"{provider} LLM returned no choices.")
    message = choices[0].get("message") or {}
    content = message.get("content")
    if not isinstance(content, str) or not content.strip():
        raise RuntimeError(f"{provider} LLM returned empty content.")
    return content.strip()


def probeLocalLlm() -> dict[str, Any]:
    payload: dict[str, Any] = {
        "available": False,
        "enabled": localLlmEnabled(),
        "baseUrl": localLlmBaseUrl(),
        "model": localLlmModel(),
        "label": "Local AI",
    }
    if not localLlmEnabled():
        payload["error"] = "LOCAL_LLM_ENABLED is off"
        return payload
    try:
        response = requests.get(
            f"{localLlmBaseUrl()}/models",
            headers=_headersFor("local"),
            timeout=3.0,
        )
        response.raise_for_status()
        payload["available"] = True
    except Exception as exc:
        payload["error"] = str(exc)
    return payload


def probeOpenAi() -> dict[str, Any]:
    payload: dict[str, Any] = {
        "available": False,
        "enabled": openaiEnabled(),
        "baseUrl": openaiBaseUrl(),
        "model": openaiModel(),
        "label": "OpenAI",
    }
    if not openaiEnabled():
        payload["error"] = "OPENAI_API_KEY is not set on the API server"
        return payload
    try:
        # Chat probe: some project keys cannot list GET /v1/models.
        response = requests.post(
            f"{openaiBaseUrl()}/chat/completions",
            headers=_headersFor("openai"),
            json={
                "model": openaiModel(),
                "messages": [{"role": "user", "content": "ping"}],
                "max_tokens": 1,
            },
            timeout=20.0,
        )
        if response.status_code == 429:
            payload["available"] = True
            payload["error"] = "rate limited (key is valid)"
            return payload
        if response.status_code in {401, 403}:
            payload["error"] = (response.text or response.reason)[:400]
            return payload
        response.raise_for_status()
        payload["available"] = True
    except Exception as exc:
        payload["error"] = str(exc)
    return payload


def classifyProviderStatus() -> dict[str, Any]:
    local = probeLocalLlm()
    openai = probeOpenAi()
    regex = {"available": True, "enabled": True, "label": "Regex"}
    if local.get("available"):
        recommended: ClassifyProvider = "local"
    elif openai.get("available"):
        recommended = "openai"
    else:
        recommended = "regex"
    return {
        "local": local,
        "openai": openai,
        "regex": regex,
        "recommended": recommended,
        "running": recommended,
    }


def normalizeClassifyProvider(value: str | None) -> ClassifyProvider:
    raw = (value or "").strip().lower()
    if raw in {"openai", "gpt", "cloud"}:
        return "openai"
    if raw in {"regex", "offline", "none"}:
        return "regex"
    if raw in {"local", "internal", "vllm", "gemma"}:
        return "local"
    return "local"


def resolveClassifyProvider(requested: str | None) -> ClassifyProvider:
    wanted = normalizeClassifyProvider(requested)
    if wanted == "regex":
        return "regex"
    if wanted == "openai":
        return "openai" if openaiEnabled() else "regex"
    if not localLlmEnabled():
        return "regex"
    return "local"


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
