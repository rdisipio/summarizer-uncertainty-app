import { useState } from "react";
import { Button, Card, H3, HTMLSelect, TextArea, Tooltip } from "@blueprintjs/core";
import hffLogo from "../hff_logo_official.jpg";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";
const DEFAULT_EDIT_TAG = "editorial refinement";
const EDIT_TAGS = ["editorial refinement", "factual error", "cultural bias"];
const LLM_MODEL_OPTIONS = [
  "Gemini 3 Flash",
  "Meta Llama 3.3 70B",
  "OpenAI gpt-oss-20b"
];

function getUnderlineClass(sentence) {
  if (!sentence.should_underline) {
    return "";
  }
  if (sentence.ambiguity > sentence.risk) {
    return "uncertain-underline-ambiguity";
  }
  return "uncertain-underline-risk";
}

function getTooltipText(sentence, showUncertainty, thresholdFraction) {
  if (!showUncertainty) {
    return undefined;
  }
  const ambiguityPercent = Math.round(sentence.ambiguity * 100);
  const riskPercent = Math.round(sentence.risk * 100);
  const ambiguityIsDominant = sentence.ambiguity > sentence.risk;
  const leadingValue = ambiguityIsDominant ? sentence.ambiguity : sentence.risk;
  const shouldBoldLeading = leadingValue > thresholdFraction;

  return (
    <span className="uncertainty-tooltip">
      <span className={ambiguityIsDominant && shouldBoldLeading ? "tooltip-strong" : ""}>
        Ambiguity: {ambiguityPercent}%
      </span>
      <span>; </span>
      <span className={!ambiguityIsDominant && shouldBoldLeading ? "tooltip-strong" : ""}>
        Risk: {riskPercent}%
      </span>
    </span>
  );
}

export function App() {
  const [sourceText, setSourceText] = useState("");
  const [thresholdPercent, setThresholdPercent] = useState(50);
  const [selectedStyle, setSelectedStyle] = useState("");
  const [selectedLlmModel, setSelectedLlmModel] = useState(LLM_MODEL_OPTIONS[0]);
  const [generatedSummary, setGeneratedSummary] = useState("");
  const [showUncertainty, setShowUncertainty] = useState(true);
  const [sentences, setSentences] = useState([]);
  const [editorialCards, setEditorialCards] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmittingChanges, setIsSubmittingChanges] = useState(false);
  const [storePersonalData, setStorePersonalData] = useState(false);
  const [submitMessage, setSubmitMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const acceptedEditsBySentence = editorialCards.reduce((accumulator, card) => {
    const cleanedCorrection = card.correction.trim();
    if (card.isAccepted && cleanedCorrection) {
      accumulator[card.sentence] = cleanedCorrection;
    }
    return accumulator;
  }, {});

  const previewParagraph =
    sentences.length > 0
      ? sentences
          .map((item) => acceptedEditsBySentence[item.sentence] || item.sentence)
          .join(" ")
      : generatedSummary;
  const previewSentences =
    sentences.length > 0
      ? sentences.map((item) => ({
          text: acceptedEditsBySentence[item.sentence] || item.sentence,
          isEdited: Boolean(acceptedEditsBySentence[item.sentence])
        }))
      : [];
  const stagedEditsCount = Object.keys(acceptedEditsBySentence).length;
  const hasStagedEdits = stagedEditsCount > 0;

  const handleGenerate = async (style) => {
    const text = sourceText.trim();
    if (!text) {
      setErrorMessage("Please paste source text before generating.");
      return;
    }

    setIsLoading(true);
    setErrorMessage("");
    setSubmitMessage("");
    setSelectedStyle(style);

    try {
      const response = await fetch(`${API_BASE_URL}/api/summarize`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          text,
          style,
          llm_model: selectedLlmModel,
          threshold: thresholdPercent / 100
        })
      });

      if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}.`);
      }

      const data = await response.json();
      setGeneratedSummary(data.summary || "");
      setShowUncertainty(data.show_uncertainty !== false);
      setSentences(Array.isArray(data.sentences) ? data.sentences : []);
      setEditorialCards([]);
    } catch (error) {
      setGeneratedSummary("");
      setSentences([]);
      setErrorMessage(error instanceof Error ? error.message : "Unknown error.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSentenceClick = (sentence) => {
    const clickedAt = new Date().toISOString();
    setEditorialCards((previousCards) => {
      const existingIndex = previousCards.findIndex((card) => card.sentence === sentence);

      if (existingIndex >= 0) {
        const existingCard = {
          ...previousCards[existingIndex],
          createdAt: clickedAt
        };
        const remainingCards = previousCards.filter((_, index) => index !== existingIndex);
        return [existingCard, ...remainingCards];
      }

      const newCard = {
        id: `${clickedAt}-${Math.random().toString(36).slice(2, 8)}`,
        sentence,
        correction: "",
        tag: DEFAULT_EDIT_TAG,
        isAccepted: false,
        createdAt: clickedAt
      };
      return [newCard, ...previousCards];
    });
  };

  const handleCorrectionChange = (cardId, value) => {
    setEditorialCards((previousCards) =>
      previousCards.map((card) =>
        card.id === cardId ? { ...card, correction: value, isAccepted: false } : card
      )
    );
  };

  const handleTagChange = (cardId, tag) => {
    setEditorialCards((previousCards) =>
      previousCards.map((card) =>
        card.id === cardId ? { ...card, tag, isAccepted: false } : card
      )
    );
  };

  const handleAcceptEdit = (cardId) => {
    const targetCard = editorialCards.find((card) => card.id === cardId);
    if (!targetCard || !targetCard.correction.trim()) {
      setErrorMessage("Add a correction before accepting the edit.");
      return;
    }
    setErrorMessage("");
    setEditorialCards((previousCards) =>
      previousCards.map((card) =>
        card.id === cardId ? { ...card, isAccepted: true } : card
      )
    );
  };

  const handleRevertEdit = (cardId) => {
    setEditorialCards((previousCards) =>
      previousCards.filter((card) => card.id !== cardId)
    );
  };

  const handleSubmitChanges = async () => {
    if (!generatedSummary) {
      setErrorMessage("Generate a summary before submitting.");
      return;
    }

    setIsSubmittingChanges(true);
    setErrorMessage("");
    setSubmitMessage("");

    try {
      const stagedEdits = editorialCards
        .filter((card) => card.isAccepted && card.correction.trim())
        .map((card) => ({
          sentence: card.sentence,
          correction: card.correction,
          tag: card.tag,
          created_at: card.createdAt
        }));

      const response = await fetch(`${API_BASE_URL}/api/editorial-changes`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          source_text: sourceText,
          style: selectedStyle || null,
          llm_model: selectedLlmModel,
          summary: generatedSummary,
          store_personal_data: storePersonalData,
          edits: stagedEdits
        })
      });

      if (!response.ok) {
        throw new Error(`Submit failed with status ${response.status}.`);
      }

      const data = await response.json();
      setSubmitMessage(
        data.edits_received > 0
          ? `Changes submitted (${data.edits_received} edits, personal storage: ${data.store_personal_data ? "enabled" : "disabled"}).`
          : `Summary accepted with no edits (personal storage: ${data.store_personal_data ? "enabled" : "disabled"}).`
      );
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unknown error.");
    } finally {
      setIsSubmittingChanges(false);
    }
  };

  const handleRestartWorkflow = () => {
    setSourceText("");
    setSelectedStyle("");
    setGeneratedSummary("");
    setSentences([]);
    setEditorialCards([]);
    setStorePersonalData(false);
    setSubmitMessage("");
    setErrorMessage("");
  };

  return (
    <main className="app-shell">
      <div className="canvas">
        <header className="masthead">
          <div className="masthead-copy">
            <p className="eyebrow">Open-source platform for transparent AI summaries</p>
            <H3>
              <span className="title-bold">Stylo</span>{" "}
              <span className="title-italic">Studio</span>
            </H3>
            <p className="deck">
              Paste a paragraph and choose a rewrite mode.
              <br />
              Click any sentence to edit it. High-uncertainty sentences are flagged automatically.
            </p>
          </div>
          <aside>
            <a
              className="foundation-badge"
              href="https://humanfeedback.io"
              target="_blank"
              rel="noreferrer noopener"
            >
              <img src={hffLogo} alt="Human Feedback Foundation logo" className="foundation-logo" />
              <div>
                <p className="foundation-text">A project of the Human Feedback Foundation.</p>
                <p className="foundation-text">We prototype open, human-centered futures for AI.</p>
              </div>
            </a>
          </aside>
        </header>

        {errorMessage ? <p className="notice error-text">{errorMessage}</p> : null}
        {submitMessage ? <p className="notice success-text">{submitMessage}</p> : null}

        <section className="workspace-grid">
          <Card className="panel source-panel" elevation={1}>
            <p className="section-title">Source Paragraph</p>
            <TextArea
              fill
              growVertically
              large
              placeholder="Paste original text here..."
              rows={10}
              value={sourceText}
              onChange={(event) => setSourceText(event.target.value)}
            />
            <div className="actions-row">
              <Button
                intent={selectedStyle === "shorten" ? "primary" : "none"}
                text="Shorten"
                loading={isLoading}
                onClick={() => handleGenerate("shorten")}
              />
              <Button
                intent={selectedStyle === "professional" ? "primary" : "none"}
                text="Professional"
                loading={isLoading}
                onClick={() => handleGenerate("professional")}
              />
              <Button
                intent={selectedStyle === "informal" ? "primary" : "none"}
                text="Informal"
                loading={isLoading}
                onClick={() => handleGenerate("informal")}
              />
            </div>
            <div className="settings-grid">
              <label className="setting-item" htmlFor="llm-model-input">
                <span>LLM model</span>
                <HTMLSelect
                  id="llm-model-input"
                  options={LLM_MODEL_OPTIONS}
                  value={selectedLlmModel}
                  onChange={(event) => setSelectedLlmModel(event.target.value)}
                />
              </label>
              <label className="setting-item" htmlFor="threshold-input">
                <span>Uncertainty threshold (%)</span>
                <input
                  id="threshold-input"
                  type="number"
                  min="0"
                  max="100"
                  step="5"
                  value={thresholdPercent}
                  onChange={(event) => setThresholdPercent(Number(event.target.value) || 0)}
                />
              </label>
            </div>
          </Card>

          <Card className="panel result-panel" elevation={1}>
            <div className="result-header">
              <p className="section-title">AI Generated Draft</p>
              <span className="staged-chip">{stagedEditsCount} staged</span>
            </div>
            {generatedSummary ? (
              <p className="summary-text">
                {sentences.length > 0
                  ? sentences.map((item, index) => (
                      <button
                        key={`${index}-${item.sentence}`}
                        type="button"
                        className="sentence-button"
                        onClick={() => handleSentenceClick(item.sentence)}
                      >
                        <Tooltip
                          content={getTooltipText(item, showUncertainty, thresholdPercent / 100)}
                          hoverOpenDelay={80}
                        >
                          <span
                            className={`sentence-interactive ${showUncertainty ? getUnderlineClass(item) : ""}`}
                          >
                            {item.sentence}
                          </span>
                        </Tooltip>{" "}
                      </button>
                    ))
                  : generatedSummary}
              </p>
            ) : (
              <p className="placeholder-text">
                Generate a rewrite to see sentence-level uncertainty and begin editing.
              </p>
            )}
            {hasStagedEdits ? (
              <div className="output-block">
                <p className="section-title">Edited Preview</p>
                <p className="paragraph-preview">
                  {previewSentences.length > 0
                    ? previewSentences.map((item, index) => (
                        <span
                          key={`${index}-${item.text}`}
                          className={item.isEdited ? "edited-sentence-bold" : ""}
                        >
                          {item.text}{" "}
                        </span>
                      ))
                    : previewParagraph}
                </p>
              </div>
            ) : null}
          </Card>
        </section>

        {editorialCards.length > 0 ? (
          <section className="cards-pane">
            <p className="section-title">Editorial Desk</p>
            <section className="cards-section">
              {editorialCards.map((card) => (
                <Card key={card.id} className="editorial-card" elevation={1}>
                  <p className="card-timestamp muted">
                    Opened: {new Date(card.createdAt).toLocaleTimeString()}
                  </p>
                  <p className="card-sentence">{card.sentence}</p>
                  <TextArea
                    fill
                    growVertically
                    placeholder="Enter your correction..."
                    rows={3}
                    value={card.correction}
                    onChange={(event) => handleCorrectionChange(card.id, event.target.value)}
                  />
                  <div className="tag-row">
                    {EDIT_TAGS.map((tagOption) => (
                      <Button
                        key={`${card.id}-${tagOption}`}
                        small
                        intent={card.tag === tagOption ? "primary" : "none"}
                        text={tagOption}
                        onClick={() => handleTagChange(card.id, tagOption)}
                      />
                    ))}
                  </div>
                  <div className="accept-row">
                    <Button
                      intent={card.isAccepted ? "success" : "none"}
                      text={card.isAccepted ? "Accepted" : "Accept"}
                      disabled={card.isAccepted}
                      onClick={() => handleAcceptEdit(card.id)}
                    />
                    {card.isAccepted ? (
                      <Button
                        intent="none"
                        text="Revert"
                        onClick={() => handleRevertEdit(card.id)}
                      />
                    ) : null}
                    {card.isAccepted ? (
                      <span className="accept-status muted">Staged for submission</span>
                    ) : (
                      <span className="accept-status muted">Not staged</span>
                    )}
                  </div>
                </Card>
              ))}
            </section>
          </section>
        ) : null}

        {generatedSummary ? (
          <div className="submit-controls">
            <label className="privacy-checkbox">
              <input
                type="checkbox"
                checked={storePersonalData}
                onChange={(event) => setStorePersonalData(event.target.checked)}
              />
              Store personal information in profile/history
            </label>
            <Button
              intent="success"
              text="Submit Changes"
              loading={isSubmittingChanges}
              onClick={handleSubmitChanges}
            />
          </div>
        ) : null}

        {submitMessage ? (
          <div className="restart-row">
            <Button intent="none" text="Start New Paragraph" onClick={handleRestartWorkflow} />
          </div>
        ) : null}
      </div>
    </main>
  );
}
