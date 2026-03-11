# Project Overview (Skeleton)

## 1. Purpose
- Build an interface for editorial corrections on textual documents (for example, Wikipedia-like pages).
- Let users paste source text, generate an LLM rewrite, and refine high-uncertainty sentences.

## 2. Core User Flow
1. User copies and pastes an original paragraph.
2. User selects one LLM rewrite mode:
   - `shorten`
   - `professional`
   - `colloquial`
3. Frontend sends the original text and selected mode to the backend.
4. Backend calls the LLM via OpenRouter and returns the edited/rewritten paragraph.
5. Backend computes uncertainty metadata (ambiguity and risk) on the LLM-edited text.
6. Frontend renders the LLM-edited output and uncertainty annotations.
7. Sentences above a configurable uncertainty threshold are visually marked.
8. User selects marked (or unmarked) sentences to edit.
9. User enters corrections and tags each edit.
10. User repeats this process for multiple sentences in the same paragraph.
11. User submits all edits.

## 3. Technical Architecture (Initial)
- Frontend responsibility:
  - Collect original text input and rewrite-mode selection
  - Send request payload to backend
  - Render LLM-edited text, uncertainty highlights, and editing controls
- Backend responsibility:
  - Receive original text from frontend
  - Run processing pipeline
  - Call the LLM through OpenRouter
  - Return edited text plus sentence-level uncertainty metadata
- LLM provider access:
  - OpenRouter is the integration layer for model calls.

## 4. Uncertainty Visualization (Initial Version)
- Uncertainty score is available per sentence in the LLM-edited output.
- A threshold control exists (for example, a toggle/slider) to determine which sentences are highlighted.
- Initial highlight style: **red wavy underline** under high-uncertainty sentences.
- Future UX experiments are expected (text label, background color, icon), but not part of v1.

## 5. Sentence Editing Interaction
- On sentence click:
  - The selected sentence is highlighted in the LLM-edited paragraph.
  - The selected sentence appears in a separate read-only text box.
  - A second text input appears below for the proposed correction.

## 6. Correction Classification
- Default tag: `editorial refinement`
- Additional tags:
  - `factual error`
  - `cultural mismatch`

## 7. Multi-Edit Support
- Users can edit multiple sentences within the same paragraph before submitting.
- Each edit should preserve:
  - Original pasted sentence/context (reference)
  - LLM-edited sentence
  - Proposed correction
  - Selected tag

## 8. Submission
- A clear action button allows the user to submit the collected edits for the paragraph.

## 9. Privacy and Data Retention
- Users must be able to use the system without storing personal information.
- Edit history should not be stored when privacy-preserving mode is active.
- Privacy behavior can be:
  - Enabled by default, or
  - Confirmed explicitly at each submission event.

## 10. Open Decisions (To Refine Later)
- Exact UI for selecting rewrite mode (`shorten`, `professional`, `colloquial`).
- Final threshold control UX (toggle vs slider vs other).
- Final high-uncertainty visual language beyond red wavy underline.
- Exact submission confirmation flow.
- Exact privacy prompt wording and default behavior.
