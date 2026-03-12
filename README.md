# summarizer-uncertainty-app

A web application for uncertainty-aware editorial rewriting.

## What It Does
- Accepts an original paragraph pasted by the user.
- Rewrites the paragraph with an LLM using one selected mode:
  - `shorten`
  - `professional`
  - `informal`
- Lets the user select an LLM model from a dropdown before generation.
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

## Runtime and Deployment
- Current target: local development and execution on macOS.
- Next phase: package the app as a Docker image.
- Planned deployment targets for that image:
  - local container runtime
  - Hugging Face Spaces

## Docker Compose (Full Stack)
Use this when you want to run frontend + backend together in containers.

Build and start:
```bash
docker compose up --build
```

Access:
- Frontend: `http://localhost:8080`
- Backend API: `http://localhost:8000`

Stop:
```bash
docker compose down
```

## Installation and Local Setup
### Prerequisites
- Python `3.13+`
- `pipenv`
- Node.js (includes `npm`)

### Backend Setup (FastAPI)
```bash
pipenv install
cp .env.example .env
pipenv run uvicorn backend.main:backend --reload
```

Required backend env var:
- `OPENROUTER_API_KEY` (stored in `.env`)

### Frontend Setup (React + Blueprint)
```bash
cd frontend
npm install
npm run dev
```

Notes:
- Python dependencies are managed with `Pipfile`/`pipenv`.
- React and Blueprint are installed locally via `npm` and imported from `node_modules`.

## Project Docs
- Basic technical rules: `BASIC_RULES.md`
- Functional and architecture skeleton: `PROJECT_OVERVIEW.md`
