# Basic Project Rules

## Scope
This document defines the baseline engineering and design rules for this project.

## Minimal Frameworks
- React (frontend framework)
- Blueprint (UI component library)
- FastAPI (backend web framework)
- OpenRouter (LLM provider integration layer)

## Backend Rules
- Language: Python
- Python version: `> 3.13`
- Environment and dependency management: `pipenv`
- Style and quality requirements:
  - Follow PEP 8 formatting conventions
  - Use type hints for public and internal code
  - Add docstrings for modules, classes, and functions

## Frontend Rules
- Framework: React
- UI library: Blueprint
- Interface direction: minimal and unobtrusive

## Design Philosophy
The product should align with Dieter Rams' 10 principles of design:

1. Good design is innovative.
2. Good design makes a product useful.
3. Good design is aesthetic.
4. Good design makes a product understandable.
5. Good design is unobtrusive.
6. Good design is honest.
7. Good design is long-lasting.
8. Good design is thorough down to the last detail.
9. Good design is environmentally friendly.
10. Good design is as little design as possible.

### User Stories
- As a user, I want to paste an original paragraph so I can quickly start from existing text.
- As a user, I want to choose a rewrite mode (`shorten`, `professional`, `colloquial`) so the output matches my editorial goal.
- As a user, I want the system to generate an LLM-edited paragraph so I can review a first draft efficiently.
- As a user, I want uncertainty (ambiguity and risk) attached to each sentence in the LLM-edited text so I can focus on risky content.
- As a user, I want high-uncertainty sentences marked with a red wavy underline so potential issues are immediately visible.
- As a user, I want to click a sentence and see it highlighted and copied into a dedicated box so I can edit it with context.
- As a user, I want to enter a correction and classify it (`editorial refinement`, `factual error`, `cultural mismatch`) so edits are structured.
- As a user, I want to edit multiple sentences before submitting so I can review a full paragraph in one pass.
- As a user, I want to submit all edits with one action so the workflow stays simple.
- As a user, I want the option to avoid storing personal data and edit history so I can preserve privacy.
