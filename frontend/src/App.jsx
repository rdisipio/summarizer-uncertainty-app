import { useState } from "react";
import { Button, Card, H3, TextArea } from "@blueprintjs/core";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";
const DEFAULT_EDIT_TAG = "editorial refinement";
const EDIT_TAGS = ["editorial refinement", "factual error", "cultural mismatch"];

export function App() {
  const [sourceText, setSourceText] = useState("");
  const [threshold, setThreshold] = useState(0.5);
  const [selectedStyle, setSelectedStyle] = useState("");
  const [generatedSummary, setGeneratedSummary] = useState("");
  const [sentences, setSentences] = useState([]);
  const [editorialCards, setEditorialCards] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const handleGenerate = async (style) => {
    const text = sourceText.trim();
    if (!text) {
      setErrorMessage("Please paste source text before generating.");
      return;
    }

    setIsLoading(true);
    setErrorMessage("");
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
            intent={selectedStyle === "colloquial" ? "primary" : "none"}
            text="Colloquial"
            loading={isLoading}
            onClick={() => handleGenerate("colloquial")}
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
      </Card>
    </main>
  );
}
