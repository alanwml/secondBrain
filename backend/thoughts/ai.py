"""AI provider integration for thought analysis.

This module owns the provider-specific HTTP request and response parsing. The
rest of the application receives a normalized Python dictionary, so changing
provider or response format does not require changing Django views.
"""

import json
import re
from urllib.parse import urljoin

import httpx
from django.conf import settings

from .models import Thought


PRICING = {
    "gpt-5.5": {"input": 5, "output": 30},
    "gpt-5.5-pro": {"input": 30, "output": 180},
}


class AIProviderError(Exception):
    """Raised when the configured AI provider cannot complete a request."""


def _text_from_response(response: dict) -> str:
    if response.get("output_text"):
        return response["output_text"]

    text_parts = []
    for item in response.get("output", []):
        if item.get("type") != "message":
            continue
        for content in item.get("content", []):
            if content.get("type") == "output_text":
                text_parts.append(content.get("text", ""))
    return "\n".join(text_parts)


def _sources_from_response(response: dict) -> list[dict]:
    sources = []
    for item in response.get("output", []):
        if item.get("type") != "web_search_call":
            continue
        for source in item.get("action", {}).get("sources", []):
            url = source.get("url")
            if url:
                sources.append({"title": source.get("title") or url, "url": url})
    return sources


def _parse_analysis(text: str) -> dict:
    cleaned = re.sub(r"^```(?:json)?\s*", "", str(text or ""), flags=re.IGNORECASE)
    cleaned = re.sub(r"\s*```$", "", cleaned).strip()
    try:
        parsed = json.loads(cleaned)
    except json.JSONDecodeError:
        return {
            "summary": "",
            "explanation": cleaned or "The model returned no explanation.",
            "key_points": [],
            "ambiguous": False,
            "contexts": [],
            "related_concepts": [],
        }

    return {
        "summary": parsed.get("summary", ""),
        "explanation": parsed.get("explanation") or parsed.get("summary", ""),
        "key_points": parsed.get("keyPoints", [])[:10] if isinstance(parsed.get("keyPoints", []), list) else [],
        "ambiguous": bool(parsed.get("ambiguous", False)),
        "contexts": parsed.get("contexts", [])[:6] if isinstance(parsed.get("contexts", []), list) else [],
        "related_concepts": parsed.get("relatedConcepts", [])[:10] if isinstance(parsed.get("relatedConcepts", []), list) else [],
    }


def _price_for(model: str, usage: dict | None) -> float | None:
    pricing = PRICING.get(model)
    if not pricing or not usage:
        return None
    input_tokens = int(usage.get("input_tokens", 0) or 0)
    output_tokens = int(usage.get("output_tokens", 0) or 0)
    return ((input_tokens * pricing["input"]) + (output_tokens * pricing["output"])) / 1_000_000


def _related_notes(thought: Thought) -> list[dict]:
    words = {word for word in re.split(r"[^a-z0-9]+", thought.text.lower()) if len(word) > 3}
    matches = []
    for candidate in Thought.objects.exclude(id=thought.id):
        candidate_words = [word for word in re.split(r"[^a-z0-9]+", candidate.text.lower()) if word]
        overlap = sum(word in words for word in candidate_words)
        if overlap:
            matches.append((overlap, candidate))

    matches.sort(key=lambda item: item[0], reverse=True)
    return [{"id": str(candidate.id), "text": candidate.text, "type": candidate.type} for _, candidate in matches[:5]]


def _preview_image(url: str) -> str | None:
    try:
        response = httpx.get(url, headers={"user-agent": "SecondBrainDjango/1.0"}, timeout=5.0, follow_redirects=True)
        response.raise_for_status()
        match = re.search(r'<meta[^>]+property=["\']og:image["\'][^>]+content=["\']([^"\']+)', response.text, re.IGNORECASE)
        if not match:
            match = re.search(r'<meta[^>]+content=["\']([^"\']+)["\'][^>]+property=["\']og:image["\']', response.text, re.IGNORECASE)
        return urljoin(url, match.group(1)) if match else None
    except (httpx.HTTPError, ValueError):
        return None


def analyze_thought(thought: Thought) -> dict:
    """Analyze one thought and return the normalized result used by the model layer."""
    api_key = getattr(settings, "AI_API_KEY", "")
    if not api_key:
        raise AIProviderError("No AI key configured. Set OPENAI_API_KEY in backend/.env.")

    model = getattr(settings, "AI_MODEL", "gpt-5.5")
    base_url = getattr(settings, "AI_BASE_URL", "https://api.openai.com/v1").rstrip("/")
    context_instruction = (
        f'The user selected this context: "{thought.selected_context}". Explain the term primarily in this context. '
        "If the selection is \"all contexts\", compare the major meanings."
        if thought.selected_context
        else "Detect whether the term or idea is ambiguous. If it has multiple plausible meanings, do not silently choose one."
    )
    developer_prompt = (
        "You are a thoughtful research assistant for a personal second brain. "
        f"Analyze the user thought without changing its intent. Use web search when useful. {context_instruction} "
        "Return ONLY valid JSON with keys: summary (string), explanation (string), keyPoints (array of strings), "
        "ambiguous (boolean), contexts (array of objects with name, confidence from 0 to 1, summary, example), "
        "relatedConcepts (array of strings). If ambiguous, contexts should list the most useful interpretations and "
        "explanation should briefly compare them. Do not invent citations; source links are collected separately."
    )
    payload = {
        "model": model,
        "tools": [{"type": "web_search_preview"}],
        "include": ["web_search_call.action.sources"],
        "store": False,
        "input": [
            {"role": "developer", "content": developer_prompt},
            {"role": "user", "content": f"Analyze this {thought.type}:\n\n{thought.text}"},
        ],
    }

    try:
        response = httpx.post(
            f"{base_url}/responses",
            headers={"Content-Type": "application/json", "Authorization": f"Bearer {api_key}"},
            json=payload,
            timeout=120.0,
        )
        data = response.json()
    except (httpx.HTTPError, ValueError) as error:
        raise AIProviderError(f"Could not contact the AI provider: {error}") from error

    if response.status_code >= 400:
        message = data.get("error", {}).get("message", f"AI provider returned {response.status_code}")
        raise AIProviderError(message)

    parsed = _parse_analysis(_text_from_response(data))
    sources = _sources_from_response(data)[:8]
    image_candidates = [{**source, "imageUrl": _preview_image(source["url"])} for source in sources[:4]]
    images = [{"title": source["title"], "url": source["url"], "imageUrl": source["imageUrl"]} for source in image_candidates if source["imageUrl"]]
    response_model = data.get("model") or model
    usage = data.get("usage", {})

    return {
        **parsed,
        "related_notes": _related_notes(thought),
        "sources": sources,
        "images": images,
        "model": response_model,
        "input_tokens": usage.get("input_tokens"),
        "output_tokens": usage.get("output_tokens"),
        "cost_usd": _price_for(response_model, usage),
    }
