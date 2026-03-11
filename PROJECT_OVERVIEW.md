# Project Overview (Skeleton)

## 1. Purpose
Build an uncertainty-aware editorial workflow where users paste source text, receive an LLM rewrite, and refine risky sentences before final submission.

## 2. Functional Flow
1. User pastes an original paragraph.
2. User selects one rewrite mode:
   - `shorten`
   - `professional`
   - `colloquial`
3. Frontend sends original text + mode to backend.
4. Backend calls LLM via OpenRouter and returns rewritten text.
5. Backend computes sentence-level uncertainty (ambiguity, risk) on the rewritten text.
6. Frontend renders rewritten text with uncertainty indicators.
7. Sentences above threshold are marked with red wavy underline (initial version).
8. User clicks a sentence to edit it.
9. Selected sentence is highlighted in the paragraph and mirrored into a separate text box.
10. User enters a correction in a second input box.
11. User classifies the correction:
    - `editorial refinement` (default)
    - `factual error`
    - `cultural mismatch`
12. User edits multiple sentences if needed.
13. User submits all edits.

## 3. Technical Architecture (Initial)
- Frontend (React + Blueprint):
  - Collect input paragraph and rewrite mode.
  - Call backend APIs.
  - Render rewritten text, uncertainty marks, edit panel, and submission controls.
- Backend (Python + FastAPI):
  - Receive source paragraph and rewrite mode.
  - Orchestrate LLM rewrite via OpenRouter.
  - Compute and return uncertainty metadata per sentence.
  - Accept and process submitted user edits.

## 4. Runtime and Deployment Plan
- Phase 1 (current): run locally on macOS for development and iteration.
- Phase 2: build a Docker image containing backend and frontend runtime components.
- Phase 3: deploy the same image either:
  - locally (containerized execution), or
  - on Hugging Face Spaces.

## 5. Interaction Rules
- Threshold-based uncertainty highlighting must be configurable in UI.
- Red wavy underline is the initial high-uncertainty marker.
- Multiple sentence edits in a single paragraph are supported before submission.
- Clicking a sentence opens an editorial card for that sentence.
- Editorial cards persist after edits are staged and do not auto-dismiss.
- If another sentence is clicked, a new editorial card is added at the top (newest-first / timestamp order).
- Each edit record includes:
  - Sentence reference
  - LLM-edited sentence
  - User correction
  - Classification tag

## 6. Privacy Requirement
Users must be able to use the system without storing personal information, including edit history.

## 7. Open Decisions
- Final UI control for threshold (toggle vs slider).
- Whether privacy-preserving mode is default or explicitly confirmed at submission.
- Future uncertainty visuals beyond red wavy underline (label/icon/background variants).

## 8. User Story Addendum
- As a user, I can switch from one editorial style button to another after a result is shown, and the system regenerates and replaces the summary with the newly selected style output.
