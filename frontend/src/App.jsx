import { useState } from "react";
import { Button, Card, H3, HTMLSelect, TextArea } from "@blueprintjs/core";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";
const DEFAULT_EDIT_TAG = "editorial refinement";
const EDIT_TAGS = ["editorial refinement", "factual error", "cultural mismatch"];
const LLM_MODEL_OPTIONS = [
  "Gemini 3 Flash",
  "Meta Llama 3.3 70B",
  "OpenAI gpt-oss-20b"
];

export function App() {
  const [sourceText, setSourceText] = useState("");
  const [threshold, setThreshold] = useState(0.5);
  const [selectedStyle, setSelectedStyle] = useState("");
  const [selectedLlmModel, setSelectedLlmModel] = useState(LLM_MODEL_OPTIONS[0]);
  const [generatedSummary, setGeneratedSummary] = useState("");
  const [sentences, setSentences] = useState([]);
  const [editorialCards, setEditorialCards] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmittingChanges, setIsSubmittingChanges] = useState(false);
  const [storePersonalData, setStorePersonalData] = useState(false);
  const [submitMessage, setSubmitMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

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
          threshold
        })
      });

      if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}.`);
      }

      const data = await response.json();
      setGeneratedSummary(data.summary || "");
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
        createdAt: clickedAt
      };
      return [newCard, ...previousCards];
    });
  };

  const handleCorrectionChange = (cardId, value) => {
    setEditorialCards((previousCards) =>
      previousCards.map((card) =>
        card.id === cardId ? { ...card, correction: value } : card
      )
    );
  };

  const handleTagChange = (cardId, tag) => {
    setEditorialCards((previousCards) =>
      previousCards.map((card) => (card.id === cardId ? { ...card, tag } : card))
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
          edits: editorialCards.map((card) => ({
            sentence: card.sentence,
            correction: card.correction,
            tag: card.tag,
            created_at: card.createdAt
          }))
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
      <Card className="panel" elevation={1}>
        <H3>Summarizer Uncertainty App</H3>
        <p className="muted">Paste a paragraph and choose a rewrite mode.</p>
        <TextArea
          fill
          growVertically
          large
          placeholder="Paste original text here..."
          rows={8}
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
        <div className="threshold-row">
          <label htmlFor="llm-model-input">LLM model</label>
          <HTMLSelect
            id="llm-model-input"
            options={LLM_MODEL_OPTIONS}
            value={selectedLlmModel}
            onChange={(event) => setSelectedLlmModel(event.target.value)}
          />
        </div>
        <div className="threshold-row">
          <label htmlFor="threshold-input">Uncertainty threshold</label>
          <input
            id="threshold-input"
            type="number"
            min="0"
            max="2"
            step="0.1"
            value={threshold}
            onChange={(event) => setThreshold(Number(event.target.value) || 0)}
          />
        </div>
        {errorMessage ? <p className="error-text">{errorMessage}</p> : null}
        {generatedSummary ? (
          <div className="output-block">
            <p className="summary-text">
              {sentences.length > 0
                ? sentences.map((item, index) => (
                    <button
                      key={`${index}-${item.sentence}`}
                      type="button"
                      className="sentence-button"
                      onClick={() => handleSentenceClick(item.sentence)}
                    >
                      <span className={item.should_underline ? "uncertain-underline" : ""}>
                        {item.sentence}
                      </span>{" "}
                    </button>
                  ))
                : generatedSummary}
            </p>
          </div>
        ) : null}
        {editorialCards.length > 0 ? (
          <section className="cards-section">
            {editorialCards.map((card) => (
              <Card key={card.id} className="editorial-card" elevation={1}>
                <p className="card-timestamp muted">
                  Created: {new Date(card.createdAt).toLocaleTimeString()}
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
              </Card>
            ))}
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
        {submitMessage ? <p className="success-text">{submitMessage}</p> : null}
        {submitMessage ? (
          <div className="restart-row">
            <Button intent="none" text="Start New Paragraph" onClick={handleRestartWorkflow} />
          </div>
        ) : null}
      </Card>
    </main>
  );
}
