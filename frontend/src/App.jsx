import { useState } from "react";
import { Button, Card, H3, TextArea } from "@blueprintjs/core";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

export function App() {
  const [sourceText, setSourceText] = useState("");
  const [threshold, setThreshold] = useState(0.5);
  const [generatedSummary, setGeneratedSummary] = useState("");
  const [sentences, setSentences] = useState([]);
  const [metadata, setMetadata] = useState(null);
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
      setMetadata(data.metadata || null);
    } catch (error) {
      setGeneratedSummary("");
      setSentences([]);
      setMetadata(null);
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
            <p className="muted">Generated summary</p>
            <p>{generatedSummary}</p>
            {metadata ? (
              <div className="metadata-block muted">
                <p>LLM version: {metadata.llm_version}</p>
                <p>Accepted at: {metadata.request_accepted_at}</p>
                <p>Completed at: {metadata.request_completed_at}</p>
              </div>
            ) : null}
            <p className="muted">Sentence uncertainty</p>
            <ul className="sentence-list">
              {sentences.map((item, index) => (
                <li key={`${index}-${item.sentence}`}>
                  <span className={item.should_underline ? "uncertain-underline" : ""}>
                    {item.sentence}
                  </span>
                  <span className="muted">
                    {" "}
                    (ambiguity: {item.ambiguity}, risk: {item.risk}, uncertainty:{" "}
                    {item.uncertainty})
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </Card>
    </main>
  );
}
