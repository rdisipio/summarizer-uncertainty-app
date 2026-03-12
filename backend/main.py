"""FastAPI application entrypoint for summarization mock APIs."""

import logging
from datetime import datetime, timezone
from random import random
from typing import Literal

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

RewriteStyle = Literal["shorten", "professional", "informal"]

MOCK_SUMMARY_SENTENCES_BY_STYLE: dict[RewriteStyle, list[str]] = {
    "shorten": [
        "This is the generated summary.",
        "A summary has been created by the AI agent.",
    ],
    "professional": [
        "This is the generated summary.",
        "A professional summary has been created by the AI agent.",
    ],
    "informal": [
        "This is the generated summary.",
        "The AI agent put together this summary in a casual tone.",
    ],
}
DEFAULT_LLM_VERSION = "openrouter/mock-v1"
logger = logging.getLogger("uvicorn.error")


class SummarizeRequest(BaseModel):
    """Input payload for text summarization."""

    text: str = Field(min_length=1)
    style: RewriteStyle
    llm_model: str = Field(default=DEFAULT_LLM_VERSION, min_length=1)
    threshold: float = Field(default=0.5, ge=0.0, le=2.0)


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
    summary: str
    sentences: list[SentenceUncertainty]


class EditorialChange(BaseModel):
    """One user-proposed editorial change."""

    sentence: str = Field(min_length=1)
    correction: str
    tag: Literal["editorial refinement", "factual error", "cultural mismatch"]
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
    """Return a mock summary with random uncertainty values per sentence."""
    logger.info(
        "Summarize request received | style=%s llm_model=%s threshold=%s text=%r",
        payload.style,
        payload.llm_model,
        payload.threshold,
        payload.text,
    )
    accepted_at = _utc_iso_now()

    summary_sentences = MOCK_SUMMARY_SENTENCES_BY_STYLE[payload.style]

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
                should_underline=uncertainty > payload.threshold,
            )
        )

    completed_at = _utc_iso_now()
    metadata = RequestMetadata(
        request_accepted_at=accepted_at,
        request_completed_at=completed_at,
        llm_version=payload.llm_model,
    )

    response = SummarizeResponse(
        metadata=metadata,
        style=payload.style,
        threshold=payload.threshold,
        summary=" ".join(summary_sentences),
        sentences=sentence_payloads,
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
        "cultural mismatch": 0,
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
            "tags={editorial_refinement:%s,factual_error:%s,cultural_mismatch:%s} "
            "store_personal_data=%s source_length=%s summary_length=%s received_at=%s"
        ),
        payload.style,
        payload.llm_model,
        response.edits_received,
        filled_corrections,
        tag_counts["editorial refinement"],
        tag_counts["factual error"],
        tag_counts["cultural mismatch"],
        response.store_personal_data,
        len(payload.source_text),
        len(payload.summary),
        response.received_at,
    )
    return response
