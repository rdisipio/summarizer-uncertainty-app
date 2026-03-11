import { useState } from "react";
import { Button, Card, H3, TextArea } from "@blueprintjs/core";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

export function App() {
  const [sourceText, setSourceText] = useState("");
  const [threshold, setThreshold] = useState(0.5);
  const [generatedSummary, setGeneratedSummary] = useState("");
  const [sentences, setSentences] = useState([]);
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
    } catch (error) {
      setGeneratedSummary("");
      setSentences([]);
      setErrorMessage(error instanceof Error ? error.message : "Unknown error.");
    } finally {
      setIsLoading(false);
    }
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
            intent="primary"
            text="Shorten"
            loading={isLoading}
            onClick={() => handleGenerate("shorten")}
          />
          <Button
            text="Professional"
            loading={isLoading}
            onClick={() => handleGenerate("professional")}
          />
          <Button
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
                    <span key={`${index}-${item.sentence}`}>
                      <span className={item.should_underline ? "uncertain-underline" : ""}>
                        {item.sentence}
                      </span>{" "}
                    </span>
                  ))
                : generatedSummary}
            </p>
          </div>
        ) : null}
      </Card>
    </main>
  );
}
