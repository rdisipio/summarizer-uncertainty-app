# Project Overview (Skeleton)

## 1. Purpose
- Build an interface for editorial corrections on textual documents (for example, Wikipedia-like pages).
- Help users identify and revise sentences with high uncertainty.

## 2. Core User Flow
1. User sees a paragraph.
2. Each sentence is annotated with uncertainty metadata (ambiguity and risk).
3. Sentences above a configurable uncertainty threshold are visually marked.
4. User selects a sentence to edit.
5. User enters a correction and tags the edit type.
6. User repeats this process for multiple sentences in the same paragraph.
7. User submits all edits.

## 3. Uncertainty Visualization (Initial Version)
- Uncertainty score is available per sentence.
- A threshold control exists (for example, a toggle/slider) to determine which sentences are highlighted.
- Initial highlight style: **red wavy underline** under high-uncertainty sentences.
- Future UX experiments are expected (text label, background color, icon), but not part of v1.

## 4. Sentence Editing Interaction
- On sentence click:
  - The selected sentence is highlighted in the original paragraph.
  - The selected sentence appears in a separate read-only text box.
  - A second text input appears below for the proposed correction.

## 5. Correction Classification
- Default tag: `editorial refinement`
- Additional tags:
  - `factual error`
  - `cultural mismatch`

## 6. Multi-Edit Support
- Users can edit multiple sentences within the same paragraph before submitting.
- Each edit should preserve:
  - Original sentence
  - Proposed correction
  - Selected tag

## 7. Submission
- A clear action button allows the user to submit the collected edits for the paragraph.

## 8. Privacy and Data Retention
- Users must be able to use the system without storing personal information.
- Edit history should not be stored when privacy-preserving mode is active.
- Privacy behavior can be:
  - Enabled by default, or
  - Confirmed explicitly at each submission event.

## 9. Open Decisions (To Refine Later)
- Final threshold control UX (toggle vs slider vs other).
- Final high-uncertainty visual language beyond red wavy underline.
- Exact submission confirmation flow.
- Exact privacy prompt wording and default behavior.
