"""FastAPI application entrypoint for summarization and editorial APIs."""

import logging
import os
import re
from datetime import datetime, timezone
from random import random
from typing import Any
from typing import Literal

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

RewriteStyle = Literal["shorten", "professional", "informal"]

STYLE_GUIDANCE: dict[RewriteStyle, str] = {
    "shorten": "Make the text shorter while preserving core meaning.",
    "professional": "Use a professional, neutral, precise editorial tone.",
    "informal": "Use a more informal and conversational editorial tone.",
}

MODEL_ALIASES: dict[str, str] = {
    "Gemini 3 Flash": "google/gemini-2.5-flash-lite",
    "Meta Llama 3.3 70B": "meta-llama/llama-3.3-70b-instruct",
    "OpenAI gpt-oss-20b": "openai/gpt-oss-20b",
}
DEFAULT_LLM_VERSION = "openai/gpt-oss-20b"
logger = logging.getLogger("uvicorn.error")

load_dotenv()

OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY", "")
OPENROUTER_ENDPOINT = os.getenv(
    "OPENROUTER_ENDPOINT", "https://openrouter.ai/api/v1/chat/completions"
)
OPENROUTER_SITE_URL = os.getenv("OPENROUTER_SITE_URL", "http://localhost:8000")
OPENROUTER_APP_NAME = os.getenv("OPENROUTER_APP_NAME", "summarizer-uncertainty-app")


def _env_flag(name: str, default: bool) -> bool:
    """Parse boolean environment flags safely."""
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


SHOW_UNCERTAINTY = _env_flag("SHOW_UNCERTAINTY", True)


class SummarizeRequest(BaseModel):
    """Input payload for text summarization."""

    text: str = Field(min_length=1)
    style: RewriteStyle
    llm_model: str = Field(default=DEFAULT_LLM_VERSION, min_length=1)
    threshold: float = Field(default=0.5, ge=0.0, le=1.0)


class RequestMetadata(BaseModel):
    """Timing and model metadata for summarize responses."""

    request_accepted_at: str
    request_completed_at: str
    llm_version: str


class SentenceUncertainty(BaseModel):
    """Uncertainty scores associated with one output sentence."""

    sentence: str
    ambiguity: float
    risk: float
    uncertainty: float
    should_underline: bool


class SummarizeResponse(BaseModel):
    """Output payload for text summarization."""

    metadata: RequestMetadata
    style: str
    threshold: float
    show_uncertainty: bool
    summary: str
    sentences: list[SentenceUncertainty]


class EditorialChange(BaseModel):
    """One user-proposed editorial change."""

    sentence: str = Field(min_length=1)
    correction: str
    tag: Literal["editorial refinement", "factual error", "cultural bias"]
    created_at: str


class EditorialChangesRequest(BaseModel):
    """Payload for submitting staged editorial changes."""

    source_text: str = Field(min_length=1)
    style: RewriteStyle | None = None
    llm_model: str | None = None
    summary: str = Field(min_length=1)
    store_personal_data: bool = False
    edits: list[EditorialChange]


class EditorialChangesResponse(BaseModel):
    """Acknowledgement payload for editorial change submissions."""

    status: Literal["accepted"]
    received_at: str
    edits_received: int
    store_personal_data: bool


def _utc_iso_now() -> str:
    """Return the current UTC timestamp in ISO 8601 format."""
    return datetime.now(timezone.utc).isoformat()


def _resolve_model(selected_model: str) -> str:
    """Map UI-friendly model names to OpenRouter model identifiers."""
    return MODEL_ALIASES.get(selected_model, selected_model)


def _build_prompt(original_text: str, style: RewriteStyle) -> str:
    """Build the user prompt with source text and style guidance."""
    guidance = STYLE_GUIDANCE[style]
    original_words = len(original_text.split())
    target_words = max(12, int(original_words * 0.6))
    return (
        f"{guidance}\n\n"
        "Summarize and rewrite the following text.\n"
        f"The output must be strictly shorter than the original ({original_words} words).\n"
        f"Target maximum length: {target_words} words.\n"
        "Return only one rewritten paragraph.\n\n"
        f"Original text:\n{original_text}"
    )


def _extract_llm_text(payload: dict[str, Any]) -> str:
    """Extract text content from OpenRouter chat completion payload."""
    choices = payload.get("choices", [])
    if not choices:
        raise HTTPException(status_code=502, detail="OpenRouter returned no choices.")

    message = choices[0].get("message", {})
    content = message.get("content")
    if isinstance(content, str):
        text = content.strip()
        if text:
            return text
    if isinstance(content, list):
        parts: list[str] = []
        for item in content:
            if isinstance(item, dict) and item.get("type") == "text":
                text_value = item.get("text", "")
                if isinstance(text_value, str):
                    parts.append(text_value)
        joined = " ".join(part.strip() for part in parts if part.strip()).strip()
        if joined:
            return joined
    raise HTTPException(status_code=502, detail="OpenRouter returned empty content.")


def _split_sentences(text: str) -> list[str]:
    """Split generated paragraph into display sentences."""
    chunks = re.split(r"(?<=[.!?])\s+", text.strip())
    sentences = [chunk.strip() for chunk in chunks if chunk.strip()]
    return sentences if sentences else [text.strip()]


def _generate_summary_with_openrouter(payload: SummarizeRequest) -> tuple[str, str]:
    """Call OpenRouter and return (rewritten_text, resolved_model_version)."""
    if not OPENROUTER_API_KEY:
        raise HTTPException(
            status_code=500,
            detail="OPENROUTER_API_KEY is not configured in environment.",
        )

    resolved_model = _resolve_model(payload.llm_model)
    request_body = {
        "model": resolved_model,
        "messages": [
            {
                "role": "system",
                "content": (
                    "You are an expert editorial assistant. "
                    "Return only the rewritten paragraph text."
                ),
            },
            {"role": "user", "content": _build_prompt(payload.text, payload.style)},
        ],
        "temperature": 0.2,
    }
    headers = {
        "Authorization": f"Bearer {OPENROUTER_API_KEY}",
        "Content-Type": "application/json",
        "HTTP-Referer": OPENROUTER_SITE_URL,
        "X-Title": OPENROUTER_APP_NAME,
    }

    try:
        with httpx.Client(timeout=45.0) as client:
            llm_response = client.post(
                OPENROUTER_ENDPOINT,
                headers=headers,
                json=request_body,
            )
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"OpenRouter request failed: {exc}") from exc

    if llm_response.status_code >= 400:
        raise HTTPException(
            status_code=502,
            detail=f"OpenRouter error {llm_response.status_code}: {llm_response.text}",
        )

    payload_json = llm_response.json()
    rewritten_text = _extract_llm_text(payload_json)
    returned_model = payload_json.get("model")
    model_version = returned_model if isinstance(returned_model, str) else resolved_model
    return rewritten_text, model_version


backend = FastAPI(title="Summarizer Uncertainty API", version="0.1.0")

backend.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@backend.get("/api/health")
def health() -> dict[str, str]:
    """Return a basic health payload."""
    return {"status": "ok"}


@backend.post("/api/summarize", response_model=SummarizeResponse)
def summarize(payload: SummarizeRequest) -> SummarizeResponse:
    """Generate a rewritten paragraph and attach uncertainty annotations."""
    logger.info(
        "Summarize request received | style=%s llm_model=%s threshold=%s text=%r",
        payload.style,
        payload.llm_model,
        payload.threshold,
        payload.text,
    )
    accepted_at = _utc_iso_now()

    summary_text, llm_version = _generate_summary_with_openrouter(payload)
    summary_sentences = _split_sentences(summary_text)

    sentence_payloads: list[SentenceUncertainty] = []
    for sentence in summary_sentences:
        ambiguity = round(random(), 4)
        risk = round(random(), 4)
        uncertainty = round((ambiguity + risk) / 2, 4)
        sentence_payloads.append(
            SentenceUncertainty(
                sentence=sentence,
                ambiguity=ambiguity,
                risk=risk,
                uncertainty=uncertainty,
                should_underline=(
                    ambiguity > payload.threshold or risk > payload.threshold
                ),
            )
        )

    completed_at = _utc_iso_now()
    metadata = RequestMetadata(
        request_accepted_at=accepted_at,
        request_completed_at=completed_at,
        llm_version=llm_version,
    )

    response = SummarizeResponse(
        metadata=metadata,
        style=payload.style,
        threshold=payload.threshold,
        show_uncertainty=SHOW_UNCERTAINTY,
        summary=summary_text,
        sentences=[
            SentenceUncertainty(
                sentence=item.sentence,
                ambiguity=item.ambiguity,
                risk=item.risk,
                uncertainty=item.uncertainty,
                should_underline=item.should_underline if SHOW_UNCERTAINTY else False,
            )
            for item in sentence_payloads
        ],
    )

    underlined_count = sum(1 for item in sentence_payloads if item.should_underline)
    mean_uncertainty = round(
        sum(item.uncertainty for item in sentence_payloads) / len(sentence_payloads), 4
    )
    logger.info(
        (
            "Summarize response ready | style=%s threshold=%s llm_version=%s "
            "sentences=%s underlined=%s mean_uncertainty=%s accepted_at=%s completed_at=%s"
        ),
        response.style,
        response.threshold,
        response.metadata.llm_version,
        len(response.sentences),
        underlined_count,
        mean_uncertainty,
        response.metadata.request_accepted_at,
        response.metadata.request_completed_at,
    )

    return response


@backend.post("/api/editorial-changes", response_model=EditorialChangesResponse)
def submit_editorial_changes(payload: EditorialChangesRequest) -> EditorialChangesResponse:
    """Receive staged editorial changes without applying business processing."""
    received_at = _utc_iso_now()
    tag_counts = {
        "editorial refinement": 0,
        "factual error": 0,
        "cultural bias": 0,
    }
    filled_corrections = 0
    for edit in payload.edits:
        tag_counts[edit.tag] += 1
        if edit.correction.strip():
            filled_corrections += 1

    response = EditorialChangesResponse(
        status="accepted",
        received_at=received_at,
        edits_received=len(payload.edits),
        store_personal_data=payload.store_personal_data,
    )
    logger.info(
        (
            "Editorial changes accepted | style=%s llm_model=%s edits_received=%s filled_corrections=%s "
            "tags={editorial_refinement:%s,factual_error:%s,cultural_bias:%s} "
            "store_personal_data=%s source_length=%s summary_length=%s received_at=%s"
        ),
        payload.style,
        payload.llm_model,
        response.edits_received,
        filled_corrections,
        tag_counts["editorial refinement"],
        tag_counts["factual error"],
        tag_counts["cultural bias"],
        response.store_personal_data,
        len(payload.source_text),
        len(payload.summary),
        response.received_at,
    )
    return response
