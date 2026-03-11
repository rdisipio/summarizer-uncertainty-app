# Basic Project Rules

## Scope
This document defines engineering constraints and implementation standards.

## Required Frameworks and Services
- React (frontend framework)
- Blueprint (UI component library)
- FastAPI (backend web framework)
- OpenRouter (LLM provider integration layer)

## Runtime and Deployment Rules
- Current runtime assumption: local macOS development environment.
- Deployment packaging target: Docker image.
- Initial deployment targets for the Docker image:
  - local Docker runtime
  - Hugging Face Spaces

## Backend Rules
- Language: Python
- Python version: `> 3.13`
- Environment and dependency management: `pipenv`
- Style and quality requirements:
  - Follow PEP 8 formatting conventions
  - Use type hints for public and internal code
  - Add docstrings for modules, classes, and functions

## Frontend Rules
- Build the UI with React and Blueprint.
- Keep the interface minimal and unobtrusive.
- Preserve readability of uncertainty indicators over decorative styling.

## Data and Privacy Rules
- Original user text is sent to the backend for processing.
- LLM calls are performed by the backend through OpenRouter.
- Provide a mode/flow where no personal information or edit history is persisted.
- Default submission behavior should keep personal profile/history storage disabled unless explicitly enabled by the user.

## Design Constraints
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
