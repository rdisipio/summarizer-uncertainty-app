# Project Overview (Skeleton)

## 1. Purpose
Build an uncertainty-aware editorial workflow where users paste source text, receive an LLM rewrite, and refine risky sentences before final submission.

## 2. Functional Flow
1. User pastes an original paragraph.
2. User selects one rewrite mode:
   - `shorten`
   - `professional`
   - `informal`
3. User selects an LLM model from an available dropdown list.
4. Frontend sends original text + mode + selected model to backend.
5. Backend calls LLM via OpenRouter and returns rewritten text.
6. Backend computes sentence-level uncertainty (ambiguity, risk) on the rewritten text.
7. Frontend renders rewritten text with uncertainty indicators.
8. Sentences above threshold are marked with red wavy underline (initial version).
9. User clicks a sentence to edit it.
10. Selected sentence is highlighted in the paragraph and mirrored into a separate text box.
11. User enters a correction in a second input box.
12. User classifies the correction:
    - `editorial refinement` (default)
    - `factual error`
    - `cultural mismatch`
13. User edits multiple sentences if needed.
14. User chooses whether personal profile/history storage is enabled (default: disabled).
15. User submits all edits to backend.

## 3. Technical Architecture (Initial)
- Frontend (React + Blueprint):
  - Collect input paragraph, rewrite mode, and selected model.
  - Call backend APIs.
  - Render rewritten text, uncertainty marks, edit panel, and submission controls.
- Backend (Python + FastAPI):
  - Receive source paragraph, rewrite mode, and model selection.
  - Orchestrate LLM rewrite via OpenRouter.
  - Compute and return uncertainty metadata per sentence.
  - Accept submitted user edits via a dedicated API.
  - Current stage: receive and acknowledge edits only (no downstream processing yet).

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
The storage option defaults to no personal storage and is user-controlled at submission time.

## 7. Open Decisions
- Final UI control for threshold (toggle vs slider).
- Whether privacy-preserving mode is default or explicitly confirmed at submission.
- Future uncertainty visuals beyond red wavy underline (label/icon/background variants).

## 8. User Story Addendum
- As a user, I can switch from one editorial style button to another after a result is shown, and the system regenerates and replaces the summary with the newly selected style output.
