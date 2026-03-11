"""FastAPI application entrypoint for summarization mock APIs."""

from datetime import datetime, timezone
from random import random
from typing import Literal

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

MOCK_SUMMARY_SENTENCES = [
    "This is the generated summary.",
    "A summary has been created by the AI agent.",
]
DEFAULT_LLM_VERSION = "openrouter/mock-v1"


class SummarizeRequest(BaseModel):
    """Input payload for text summarization."""

    text: str = Field(min_length=1)
    style: Literal["shorten", "professional", "colloquial"]
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
    accepted_at = _utc_iso_now()

    sentence_payloads: list[SentenceUncertainty] = []
    for sentence in MOCK_SUMMARY_SENTENCES:
        ambiguity = round(random(), 4)
        risk = round(random(), 4)
        uncertainty = round(ambiguity + risk, 4)
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
        llm_version=DEFAULT_LLM_VERSION,
    )

    return SummarizeResponse(
        metadata=metadata,
        style=payload.style,
        threshold=payload.threshold,
        summary=" ".join(MOCK_SUMMARY_SENTENCES),
        sentences=sentence_payloads,
    )
