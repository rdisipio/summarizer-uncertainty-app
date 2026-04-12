"""FastAPI application entrypoint for summarization and editorial APIs."""

import logging
import os
import re
from datetime import datetime, timezone
from pathlib import Path
import random as _random
from typing import Any
from typing import Literal

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

RewriteStyle = Literal["shorten", "professional", "informal"]
ThresholdLevel = Literal["relaxed", "normal", "conservative"]

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


def _env_show_logo_flag(default: bool) -> bool:
    """Parse SHOW_LOGO as a strict boolean string."""
    raw = os.getenv("SHOW_LOGO")
    if raw is None:
        return default
    normalized = raw.strip().lower()
    if normalized == "true":
        return True
    if normalized == "false":
        return False
    logger.warning("Invalid SHOW_LOGO=%r. Use 'true' or 'false'. Falling back to default=%s.", raw, default)
    return default


def _env_threshold_percent(name: str, default: float) -> float:
    """Parse threshold percentage from env and clamp to [0, 100]."""
    raw = os.getenv(name)
    if raw is None:
        return default
    try:
        parsed = float(raw.strip())
    except ValueError:
        logger.warning("Invalid %s=%r. Falling back to default=%s.", name, raw, default)
        return default
    return max(0.0, min(100.0, parsed))


# Uncertainty band boundaries (as fractions, 0–1), configurable via env.
# score < LOW_MAX → low, LOW_MAX ≤ score < HIGH_LOW → mid, ≥ HIGH_LOW → high
UNCERTAINTY_BAND_LOW_MAX = _env_threshold_percent("UNCERTAINTY_BAND_LOW_MAX", 20.0) / 100.0
UNCERTAINTY_BAND_HIGH_LOW = _env_threshold_percent("UNCERTAINTY_BAND_HIGH_LOW", 50.0) / 100.0

# Per-level thresholds for dual-draft generation (internal, not configurable via env).
# When mean sentence uncertainty exceeds the selected level's value, two candidates are shown.
DUAL_SUMMARY_THRESHOLDS: dict[str, float] = {
    "relaxed": 0.35,
    "normal": 0.25,
    "conservative": 0.15,
}


def _uncertainty_band(score: float) -> str:
    """Map a 0–1 uncertainty score to a display band."""
    if score < UNCERTAINTY_BAND_LOW_MAX:
        return "low"
    if score < UNCERTAINTY_BAND_HIGH_LOW:
        return "mid"
    return "high"


HF_UNCERTAINTY_API_URL = os.getenv(
    "HF_UNCERTAINTY_API_URL", "https://rdisipio-sentence-uncertainty.hf.space/score"
)
HF_UNCERTAINTY_SAMPLE_COUNT = int(os.getenv("HF_UNCERTAINTY_SAMPLE_COUNT", "20"))

SHOW_UNCERTAINTY = _env_flag("SHOW_UNCERTAINTY", True)
SHOW_LOGO = _env_show_logo_flag(True)
FRONTEND_DIST_DIR = Path(os.getenv("FRONTEND_DIST_DIR", "frontend/dist"))

logger.info(
    "Config loaded | openrouter_endpoint=%s show_uncertainty=%s show_logo=%s band_low_max=%s band_high_low=%s frontend_dist_exists=%s api_key_configured=%s",
    OPENROUTER_ENDPOINT,
    SHOW_UNCERTAINTY,
    SHOW_LOGO,
    UNCERTAINTY_BAND_LOW_MAX,
    UNCERTAINTY_BAND_HIGH_LOW,
    FRONTEND_DIST_DIR.exists(),
    bool(OPENROUTER_API_KEY),
)


class SummarizeRequest(BaseModel):
    """Input payload for text summarization."""

    text: str = Field(min_length=1)
    style: RewriteStyle
    llm_model: str = Field(default=DEFAULT_LLM_VERSION, min_length=1)
    threshold_level: ThresholdLevel = "normal"


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
    uncertainty_band: str
    should_underline: bool


class DraftCandidate(BaseModel):
    """One candidate summary with its sentence-level uncertainty annotations."""

    summary: str
    sentences: list[SentenceUncertainty]
    avg_uncertainty: float


class SummarizeResponse(BaseModel):
    """Output payload for text summarization."""

    metadata: RequestMetadata
    style: str
    show_uncertainty: bool
    requires_choice: bool = False
    avg_uncertainty: float = 0.0
    summary: str
    sentences: list[SentenceUncertainty]
    drafts: list[DraftCandidate] | None = None
    band_low_max: float
    band_high_low: float


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


class AppConfigResponse(BaseModel):
    """Runtime app feature flags and defaults for the frontend."""

    show_uncertainty: bool
    show_logo: bool
    uncertainty_band_low_max: float
    uncertainty_band_high_low: float


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
        logger.error("OPENROUTER_API_KEY is missing. Cannot call OpenRouter.")
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
        logger.exception("OpenRouter request failed: %s", exc)
        raise HTTPException(status_code=502, detail=f"OpenRouter request failed: {exc}") from exc

    if llm_response.status_code >= 400:
        logger.error(
            "OpenRouter returned error | status=%s body=%s",
            llm_response.status_code,
            llm_response.text[:1000],
        )
        raise HTTPException(
            status_code=502,
            detail=f"OpenRouter error {llm_response.status_code}: {llm_response.text}",
        )

    payload_json = llm_response.json()
    rewritten_text = _extract_llm_text(payload_json)
    returned_model = payload_json.get("model")
    model_version = returned_model if isinstance(returned_model, str) else resolved_model
    return rewritten_text, model_version


def _score_sentences_with_hf_api(
    source_text: str,
    summary_text: str,
    sample_count: int,
) -> tuple[list[SentenceUncertainty], float, float] | None:
    """Call the HF Space sentence uncertainty API.

    Returns (sentences, band_low_max, band_high_low) using the API's sentence
    segmentation and normalization boundaries, or None if unavailable.
    Boundaries are derived from normalization.boundaries as:
      band_low_max  = boundaries[1]
      band_high_low = boundaries[3]
    """
    if not HF_UNCERTAINTY_API_URL:
        return None

    seed = _random.randint(0, 99999)
    request_body = {
        "source": source_text,
        "summary": summary_text,
        "sample_count": sample_count,
        "seed": seed,
    }

    try:
        with httpx.Client(timeout=120.0) as client:
            hf_response = client.post(
                HF_UNCERTAINTY_API_URL,
                headers={"Content-Type": "application/json"},
                json=request_body,
            )
    except httpx.HTTPError as exc:
        logger.warning("HF uncertainty API request failed: %s", exc)
        return None

    if hf_response.status_code >= 400:
        logger.warning(
            "HF uncertainty API returned error | status=%s body=%s",
            hf_response.status_code,
            hf_response.text[:500],
        )
        return None

    payload = hf_response.json()
    sentence_results = payload.get("sentence_results", [])
    if not sentence_results:
        return None

    boundaries = payload.get("normalization", {}).get("boundaries", [])
    if len(boundaries) >= 4:
        band_low_max = boundaries[1]
        band_high_low = boundaries[3]
    else:
        band_low_max = UNCERTAINTY_BAND_LOW_MAX
        band_high_low = UNCERTAINTY_BAND_HIGH_LOW

    scored: list[SentenceUncertainty] = []
    for item in sentence_results:
        # uncertainty_score is the API's normalised display value (0–100).
        # Divide by 100 so it sits in [0, 1] and aligns with our band thresholds.
        score = round(item.get("uncertainty_score", 0.0) / 100.0, 4)
        band = _uncertainty_band(score)
        scored.append(
            SentenceUncertainty(
                sentence=item.get("sentence_text", ""),
                ambiguity=score,
                risk=score,
                uncertainty=score,
                uncertainty_band=band,
                should_underline=band != "low",
            )
        )
    return scored, band_low_max, band_high_low


def _get_scored_sentences(
    source_text: str,
    summary_text: str,
) -> tuple[list[SentenceUncertainty], float, float]:
    """Score summary sentences, falling back to random scores if the HF API is unavailable.

    Returns (sentences, band_low_max, band_high_low).
    """
    hf_result = _score_sentences_with_hf_api(source_text, summary_text, HF_UNCERTAINTY_SAMPLE_COUNT)
    if hf_result is not None:
        return hf_result

    logger.warning("HF uncertainty API unavailable or returned no results — falling back to random scores.")
    summary_sentences = _split_sentences(summary_text)
    sentence_payloads: list[SentenceUncertainty] = []
    for sentence in summary_sentences:
        ambiguity = round(_random.random(), 4)
        risk = round(_random.random(), 4)
        uncertainty = round((ambiguity + risk) / 2, 4)
        band = _uncertainty_band(uncertainty)
        sentence_payloads.append(
            SentenceUncertainty(
                sentence=sentence,
                ambiguity=ambiguity,
                risk=risk,
                uncertainty=uncertainty,
                uncertainty_band=band,
                should_underline=band != "low",
            )
        )
    return sentence_payloads, UNCERTAINTY_BAND_LOW_MAX, UNCERTAINTY_BAND_HIGH_LOW


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


@backend.get("/api/config", response_model=AppConfigResponse)
def app_config() -> AppConfigResponse:
    """Return runtime configuration consumed by the frontend."""
    return AppConfigResponse(
        show_uncertainty=SHOW_UNCERTAINTY,
        show_logo=SHOW_LOGO,
        uncertainty_band_low_max=UNCERTAINTY_BAND_LOW_MAX,
        uncertainty_band_high_low=UNCERTAINTY_BAND_HIGH_LOW,
    )


def _apply_show_uncertainty(
    sentences: list[SentenceUncertainty],
) -> list[SentenceUncertainty]:
    """Strip underline flags when SHOW_UNCERTAINTY is disabled."""
    if SHOW_UNCERTAINTY:
        return sentences
    return [
        SentenceUncertainty(
            sentence=item.sentence,
            ambiguity=item.ambiguity,
            risk=item.risk,
            uncertainty=item.uncertainty,
            uncertainty_band=item.uncertainty_band,
            should_underline=False,
        )
        for item in sentences
    ]


def _mean_uncertainty(sentences: list[SentenceUncertainty]) -> float:
    if not sentences:
        return 0.0
    return round(sum(item.uncertainty for item in sentences) / len(sentences), 4)


@backend.post("/api/summarize", response_model=SummarizeResponse)
def summarize(payload: SummarizeRequest) -> SummarizeResponse:
    """Generate a rewritten paragraph and attach uncertainty annotations.

    When SHOW_UNCERTAINTY is enabled and the mean sentence uncertainty of the
    first draft exceeds DUAL_SUMMARY_THRESHOLD, a second draft is generated and
    both are returned as candidates for the user to choose between.
    """
    logger.info(
        "Summarize request received | style=%s llm_model=%s text=%r",
        payload.style,
        payload.llm_model,
        payload.text,
    )
    accepted_at = _utc_iso_now()

    try:
        summary_a, llm_version = _generate_summary_with_openrouter(payload)
    except HTTPException:
        logger.exception("Summarize failed | style=%s llm_model=%s", payload.style, payload.llm_model)
        raise

    sentences_a, band_low_max, band_high_low = _get_scored_sentences(payload.text, summary_a)
    avg_a = _mean_uncertainty(sentences_a)

    threshold = DUAL_SUMMARY_THRESHOLDS[payload.threshold_level]
    requires_choice = SHOW_UNCERTAINTY and avg_a > threshold

    if requires_choice:
        try:
            summary_b, _ = _generate_summary_with_openrouter(payload)
        except HTTPException:
            logger.warning("Second draft generation failed — falling back to single draft.")
            requires_choice = False
            summary_b = ""
            sentences_b: list[SentenceUncertainty] = []
            avg_b = 0.0
        else:
            sentences_b, _, _ = _get_scored_sentences(payload.text, summary_b)
            avg_b = _mean_uncertainty(sentences_b)

    completed_at = _utc_iso_now()
    metadata = RequestMetadata(
        request_accepted_at=accepted_at,
        request_completed_at=completed_at,
        llm_version=llm_version,
    )

    if requires_choice:
        draft_a = DraftCandidate(
            summary=summary_a,
            sentences=_apply_show_uncertainty(sentences_a),
            avg_uncertainty=avg_a,
        )
        draft_b = DraftCandidate(
            summary=summary_b,
            sentences=_apply_show_uncertainty(sentences_b),
            avg_uncertainty=avg_b,
        )
        logger.info(
            (
                "Dual-draft response | style=%s llm_version=%s threshold_level=%s "
                "avg_uncertainty_a=%s avg_uncertainty_b=%s threshold=%s "
                "accepted_at=%s completed_at=%s"
            ),
            payload.style,
            llm_version,
            payload.threshold_level,
            avg_a,
            avg_b,
            threshold,
            accepted_at,
            completed_at,
        )
        return SummarizeResponse(
            metadata=metadata,
            style=payload.style,
            show_uncertainty=SHOW_UNCERTAINTY,
            requires_choice=True,
            avg_uncertainty=avg_a,
            summary="",
            sentences=[],
            drafts=[draft_a, draft_b],
            band_low_max=band_low_max,
            band_high_low=band_high_low,
        )

    final_sentences = _apply_show_uncertainty(sentences_a)
    underlined_count = sum(1 for item in final_sentences if item.should_underline)
    logger.info(
        (
            "Summarize response ready | style=%s llm_version=%s "
            "sentences=%s underlined=%s avg_uncertainty=%s accepted_at=%s completed_at=%s"
        ),
        payload.style,
        llm_version,
        len(final_sentences),
        underlined_count,
        avg_a,
        accepted_at,
        completed_at,
    )
    return SummarizeResponse(
        metadata=metadata,
        style=payload.style,
        show_uncertainty=SHOW_UNCERTAINTY,
        requires_choice=False,
        avg_uncertainty=avg_a,
        summary=summary_a,
        sentences=final_sentences,
        band_low_max=band_low_max,
        band_high_low=band_high_low,
    )


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


if FRONTEND_DIST_DIR.exists():
    assets_dir = FRONTEND_DIST_DIR / "assets"
    index_html_path = FRONTEND_DIST_DIR / "index.html"

    def _current_frontend_assets() -> tuple[str | None, str | None]:
        """Extract the current entry JS and CSS asset names from index.html."""
        if not index_html_path.exists():
            return None, None
        index_html = index_html_path.read_text(encoding="utf-8")
        js_match = re.search(r'src="/assets/([^"]+)"', index_html)
        css_match = re.search(r'href="/assets/([^"]+\.css)"', index_html)
        current_js = js_match.group(1) if js_match else None
        current_css = css_match.group(1) if css_match else None
        return current_js, current_css

    def _frontend_file_response(path: Path, no_cache: bool = False) -> FileResponse:
        """Serve frontend files with cache headers appropriate to their role."""
        response = FileResponse(path)
        if no_cache:
            response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
            response.headers["Pragma"] = "no-cache"
            response.headers["Expires"] = "0"
        return response

    @backend.get("/assets/{asset_name:path}", include_in_schema=False)
    def serve_frontend_asset(asset_name: str) -> FileResponse:
        """Serve frontend assets and recover from stale cached entry filenames."""
        requested = assets_dir / asset_name
        if requested.exists() and requested.is_file():
            return _frontend_file_response(requested)

        current_js, current_css = _current_frontend_assets()
        if asset_name.startswith("index-") and asset_name.endswith(".js") and current_js:
            fallback_js = assets_dir / current_js
            if fallback_js.exists():
                logger.warning(
                    "Serving fallback JS asset for stale request | requested=%s fallback=%s",
                    asset_name,
                    current_js,
                )
                return _frontend_file_response(fallback_js, no_cache=True)
        if asset_name.startswith("index-") and asset_name.endswith(".css") and current_css:
            fallback_css = assets_dir / current_css
            if fallback_css.exists():
                logger.warning(
                    "Serving fallback CSS asset for stale request | requested=%s fallback=%s",
                    asset_name,
                    current_css,
                )
                return _frontend_file_response(fallback_css, no_cache=True)

        raise HTTPException(status_code=404, detail="Asset not found")

    @backend.get("/{full_path:path}", include_in_schema=False)
    def serve_frontend(full_path: str) -> FileResponse:
        """Serve bundled frontend files when running as a single container."""
        if full_path.startswith("api"):
            raise HTTPException(status_code=404, detail="Not found")

        requested = FRONTEND_DIST_DIR / full_path
        if full_path and requested.exists() and requested.is_file():
            return _frontend_file_response(requested)
        # Do not cache index.html so clients always pick up the latest hashed assets.
        return _frontend_file_response(FRONTEND_DIST_DIR / "index.html", no_cache=True)
