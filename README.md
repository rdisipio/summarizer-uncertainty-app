# summarizer-uncertainty-app

A web application for uncertainty-aware editorial rewriting.

## What It Does
- Accepts an original paragraph pasted by the user.
- Rewrites the paragraph with an LLM using one selected mode:
  - `shorten`
  - `professional`
  - `colloquial`
- Annotates the LLM-edited text with sentence-level uncertainty (ambiguity and risk).
- Highlights high-uncertainty sentences (initial UX: red wavy underline).
- Lets users apply and classify sentence-level corrections before submitting.

## Why It Exists
The app helps editors focus attention on risky or ambiguous parts of generated text, reducing review effort while keeping quality and traceability.

## Privacy Principle
Users must be able to submit edits without storing personal information or edit history.

## Core Stack
- Frontend: React + Blueprint
- Backend: Python + FastAPI
- LLM integration: OpenRouter

## Project Docs
- Basic technical rules: `BASIC_RULES.md`
- Functional and architecture skeleton: `PROJECT_OVERVIEW.md`
