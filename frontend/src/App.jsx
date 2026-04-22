import { useEffect, useState } from "react";
import { Button, Card, Collapse, H3, HTMLSelect, TextArea, Tooltip } from "@blueprintjs/core";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "";
const API_SERVER = import.meta.env.VITE_API_SERVER || "https://rdisipio-sentence-uncertainty.hf.space";
const HEALTH_CHECK_INTERVAL_MS = Number(import.meta.env.VITE_HEALTH_CHECK_INTERVAL_MS) || 60_000;
const DEFAULT_EDIT_TAG = "editorial refinement";
const EDIT_TAGS = ["editorial refinement", "factual error", "cultural bias"];
const LLM_MODEL_OPTIONS = [
  "Gemini 3 Flash",
  "Meta Llama 3.3 70B",
  "OpenAI gpt-oss-20b"
];
const THRESHOLD_LEVEL_OPTIONS = [
  { label: "Relaxed", value: "relaxed" },
  { label: "Normal", value: "normal" },
  { label: "Conservative", value: "conservative" },
];
const buildApiUrl = (path) => `${API_BASE_URL}${path}`;

const extractApiError = async (response) => {
  try {
    const payload = await response.json();
    if (payload && typeof payload.detail === "string") {
      return payload.detail;
    }
    return `Request failed with status ${response.status}.`;
  } catch {
    return `Request failed with status ${response.status}.`;
  }
};


function getUnderlineClass(sentence) {
  const band = sentence.uncertainty_band;
  if (band === "mid") return "uncertain-underline-mid";
  if (band === "high") return "uncertain-underline-high";
  return "";
}

function getTooltipText(sentence, showUncertainty, showAmbiguity) {
  if (!showUncertainty) {
    return undefined;
  }
  const band = sentence.uncertainty_band;
  const uncertaintyPct = Math.round(sentence.uncertainty * 100);
  const ambiguityPct = Math.round((sentence.ambiguity ?? sentence.uncertainty) * 100);
  return (
    <span className="uncertainty-tooltip">
      Uncertainty: {band} ({uncertaintyPct}%){showAmbiguity ? ` · Ambiguity: ${ambiguityPct}%` : ""}
    </span>
  );
}

export function App() {
  const [sourceText, setSourceText] = useState("");
  const [selectedStyle, setSelectedStyle] = useState("");
  const [selectedLlmModel, setSelectedLlmModel] = useState(LLM_MODEL_OPTIONS[0]);
  const [selectedThresholdLevel, setSelectedThresholdLevel] = useState("normal");
  const [showAdvancedOptions, setShowAdvancedOptions] = useState(false);
  const [generatedSummary, setGeneratedSummary] = useState("");
  const [showUncertainty, setShowUncertainty] = useState(true);
  const [showAmbiguity, setShowAmbiguity] = useState(false);
  const [uncertaintyAvailable, setUncertaintyAvailable] = useState(true);
  const [sentences, setSentences] = useState([]);
  const [editorialCards, setEditorialCards] = useState([]);
  const [draftChoices, setDraftChoices] = useState(null);
  const [rescoredSentences, setRescoredSentences] = useState(null);
  const [scoringServerBooting, setScoringServerBooting] = useState(false);
  const [serverAsleep, setServerAsleep] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingStatusMessage, setLoadingStatusMessage] = useState("");
  const [isRescoring, setIsRescoring] = useState(false);
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

  useEffect(() => {
    let cancelled = false;
    const POLL_INTERVAL_MS = 5_000;
    const deadline = Date.now() + 120_000;

    const pollReady = () => {
      fetch(`${API_SERVER}/is-ready`)
        .then((res) => res.json())
        .then(({ ready }) => {
          if (cancelled) return;
          if (ready) {
            console.log("API server ready");
            setScoringServerBooting(false);
          } else if (Date.now() < deadline) {
            setTimeout(pollReady, POLL_INTERVAL_MS);
          } else {
            console.warn("API server did not become ready within 2 minutes");
            setScoringServerBooting(false);
          }
        })
        .catch(() => {
          if (cancelled) return;
          if (Date.now() < deadline) {
            setTimeout(pollReady, POLL_INTERVAL_MS);
          } else {
            setScoringServerBooting(false);
          }
        });
    };

    // Check readiness first — only show the booting banner and send a wake
    // call if the server is not already up. This avoids a race where a
    // restarting server still answers true on the first poll from its old
    // instance before it actually goes down.
    fetch(`${API_SERVER}/is-ready`)
      .then((res) => res.json())
      .then(({ ready }) => {
        if (cancelled) return;
        if (ready) {
          console.log("API server already ready");
        } else {
          console.log("Waking API server...");
          setScoringServerBooting(true);
          fetch(`${API_SERVER}/wake`).catch(() => {});
          setTimeout(pollReady, POLL_INTERVAL_MS);
        }
      })
      .catch(() => {
        if (cancelled) return;
        console.log("Waking API server...");
        setScoringServerBooting(true);
        fetch(`${API_SERVER}/wake`).catch(() => {});
        setTimeout(pollReady, POLL_INTERVAL_MS);
      });

    const loadConfig = async () => {
      try {
        const response = await fetch(buildApiUrl("/api/config"));
        if (!response.ok) {
          return;
        }
        const config = await response.json();
        if (typeof config.uncertainty_band_low_max === "number") {
          setBandLowMax(config.uncertainty_band_low_max);
        }
        if (typeof config.uncertainty_band_high_low === "number") {
          setBandHighLow(config.uncertainty_band_high_low);
        }
        if (typeof config.show_ambiguity === "boolean") {
          setShowAmbiguity(config.show_ambiguity);
        }
      } catch {
        // Keep defaults if config endpoint is unavailable.
      }
    };
    void loadConfig();

    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let intervalId = null;

    const startRecovery = () => {
      const deadline = Date.now() + 120_000;
      const poll = () => {
        fetch(`${API_SERVER}/is-ready`)
          .then((res) => res.json())
          .then(({ ready }) => {
            if (cancelled) return;
            if (ready) {
              console.log("API server recovered");
              setServerAsleep(false);
              intervalId = setInterval(checkHealth, HEALTH_CHECK_INTERVAL_MS);
            } else if (Date.now() < deadline) {
              setTimeout(poll, 5_000);
            } else {
              console.warn("API server did not recover within 2 minutes — resuming app");
              setServerAsleep(false);
              intervalId = setInterval(checkHealth, HEALTH_CHECK_INTERVAL_MS);
            }
          })
          .catch(() => {
            if (cancelled) return;
            if (Date.now() < deadline) {
              setTimeout(poll, 5_000);
            } else {
              setServerAsleep(false);
              intervalId = setInterval(checkHealth, HEALTH_CHECK_INTERVAL_MS);
            }
          });
      };
      setTimeout(poll, 5_000);
    };

    // eslint-disable-next-line prefer-const
    function checkHealth() {
      fetch(`${API_SERVER}/health`)
        .then((res) => { if (!res.ok) throw new Error("not ok"); })
        .catch(() => {
          if (cancelled) return;
          clearInterval(intervalId);
          intervalId = null;
          console.warn("API server health check failed — waking");
          setServerAsleep(true);
          fetch(`${API_SERVER}/wake`).catch(() => {});
          startRecovery();
        });
    }

    intervalId = setInterval(checkHealth, HEALTH_CHECK_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    if (!isLoading) {
      setLoadingStatusMessage("");
      return;
    }
    const timer = setTimeout(() => {
      setLoadingStatusMessage(
        "Still working\u2014if uncertainty was high, a second draft is being generated for comparison\u2026"
      );
    }, 7000);
    return () => clearTimeout(timer);
  }, [isLoading]);

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
      const response = await fetch(buildApiUrl("/api/summarize"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          text,
          style,
          llm_model: selectedLlmModel,
          threshold_level: selectedThresholdLevel,
        })
      });

      if (!response.ok) {
        throw new Error(await extractApiError(response));
      }

      const data = await response.json();
      setShowUncertainty(data.show_uncertainty !== false);
      setUncertaintyAvailable(data.uncertainty_available !== false);
      setEditorialCards([]);
      setRescoredSentences(null);

      if (data.requires_choice && Array.isArray(data.drafts) && data.drafts.length === 2) {
        setDraftChoices({ drafts: data.drafts, avgUncertainty: data.avg_uncertainty ?? 0 });
        setGeneratedSummary("");
        setSentences([]);
      } else {
        setDraftChoices(null);
        setGeneratedSummary(data.summary || "");
        setSentences(Array.isArray(data.sentences) ? data.sentences : []);
      }
    } catch (error) {
      setGeneratedSummary("");
      setSentences([]);
      setErrorMessage(
        error instanceof TypeError
          ? "Network error: could not reach backend service."
          : error instanceof Error
            ? error.message
            : "Unknown error."
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleChooseDraft = (draft) => {
    setGeneratedSummary(draft.summary);
    setSentences(Array.isArray(draft.sentences) ? draft.sentences : []);
    setDraftChoices(null);
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
    setRescoredSentences(null);
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

  const handleRecheck = async (textToScore) => {
    setIsRescoring(true);
    setErrorMessage("");
    try {
      const response = await fetch(buildApiUrl("/api/score"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: sourceText, text: textToScore }),
      });
      if (!response.ok) {
        throw new Error(await extractApiError(response));
      }
      const data = await response.json();
      if (Array.isArray(data.sentences)) {
        // For sentences that were not edited, reuse the original score so that
        // context-driven variance in the HF API doesn't produce misleading diffs.
        const originalByText = Object.fromEntries(sentences.map((s) => [s.sentence, s]));
        const editedTexts = new Set(Object.values(acceptedEditsBySentence));
        const merged = data.sentences.map((s) => {
          const isEdited = editedTexts.has(s.sentence);
          const original = originalByText[s.sentence];
          return isEdited || !original ? s : original;
        });
        setRescoredSentences(merged);
      } else {
        setRescoredSentences(null);
      }
    } catch (error) {
      setErrorMessage(
        error instanceof TypeError
          ? "Network error: could not reach backend service."
          : error instanceof Error ? error.message : "Unknown error."
      );
    } finally {
      setIsRescoring(false);
    }
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

      const response = await fetch(buildApiUrl("/api/editorial-changes"), {
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
        throw new Error(await extractApiError(response));
      }

      const data = await response.json();
      const avgUncertainty = sentences.length > 0
        ? sentences.reduce((sum, s) => sum + s.uncertainty, 0) / sentences.length
        : null;
      const avgPct = avgUncertainty !== null ? Math.round(avgUncertainty * 100) : null;
      const avgBand = avgUncertainty !== null
        ? sentences.filter(s => s.uncertainty_band !== "low").length > sentences.length / 2
          ? "high"
          : sentences.some(s => s.uncertainty_band !== "low")
            ? "mid"
            : "low"
        : null;
      const uncertaintyNote = avgPct !== null ? ` Average uncertainty: ${avgBand} (${avgPct}%).` : "";
      setSubmitMessage(
        data.edits_received > 0
          ? `Changes submitted (${data.edits_received} edits, personal storage: ${data.store_personal_data ? "enabled" : "disabled"}).${uncertaintyNote}`
          : `Summary accepted with no edits (personal storage: ${data.store_personal_data ? "enabled" : "disabled"}).${uncertaintyNote}`
      );
    } catch (error) {
      setErrorMessage(
        error instanceof TypeError
          ? "Network error: could not reach backend service."
          : error instanceof Error
            ? error.message
            : "Unknown error."
      );
    } finally {
      setIsSubmittingChanges(false);
    }
  };

  const handleRestartWorkflow = () => {
    setSourceText("");
    setSelectedStyle("");
    setGeneratedSummary("");
    setSentences([]);
    setDraftChoices(null);
    setRescoredSentences(null);
    setUncertaintyAvailable(true);
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
          {/* Logo badge temporarily disabled for debugging.
          {showLogo ? (
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
          ) : null}
          */}
        </header>

        {serverAsleep ? (
          <p className="notice warning-text">Scoring server went to sleep. Restart requested — please wait while it comes back online.</p>
        ) : null}
        {scoringServerBooting ? (
          <p className="notice info-text">Scoring server is starting up — uncertainty scores will be available shortly.</p>
        ) : null}
        {errorMessage ? <p className="notice error-text">{errorMessage}</p> : null}
        {!uncertaintyAvailable ? (
          <p className="notice error-text">Uncertainty scores are unavailable — the scoring service could not be reached.</p>
        ) : null}
        {submitMessage ? (
          <div className="notice success-text submit-success-row">
            <span>{submitMessage}</span>
            <Button text="Start New Paragraph" onClick={handleRestartWorkflow} />
          </div>
        ) : null}

        <section className="workspace-grid">
          <Card className="panel source-panel" elevation={1}>
            <p className="section-title">Source Paragraph</p>
            <TextArea
              fill
              growVertically
              placeholder="Paste original text here..."
              rows={10}
              value={sourceText}
              readOnly={!!submitMessage || serverAsleep}
              onChange={(event) => setSourceText(event.target.value)}
            />
            <div className="actions-row">
              <Button
                intent={selectedStyle === "shorten" ? "primary" : "none"}
                text="Shorten"
                loading={isLoading}
                disabled={!!submitMessage || serverAsleep}
                onClick={() => handleGenerate("shorten")}
              />
              <Button
                intent={selectedStyle === "professional" ? "primary" : "none"}
                text="Professional"
                loading={isLoading}
                disabled={!!submitMessage || serverAsleep}
                onClick={() => handleGenerate("professional")}
              />
              <Button
                intent={selectedStyle === "informal" ? "primary" : "none"}
                text="Informal"
                loading={isLoading}
                disabled={!!submitMessage || serverAsleep}
                onClick={() => handleGenerate("informal")}
              />
            </div>
            {loadingStatusMessage ? (
              <p className="loading-status-message">{loadingStatusMessage}</p>
            ) : null}
            <button
              type="button"
              className="advanced-toggle"
              onClick={() => setShowAdvancedOptions((v) => !v)}
              aria-expanded={showAdvancedOptions}
            >
              Advanced options
              <span className={`advanced-toggle-chevron ${showAdvancedOptions ? "advanced-toggle-chevron--open" : ""}`}>›</span>
            </button>
            <Collapse isOpen={showAdvancedOptions}>
              <div className="settings-grid">
                <label className="setting-item" htmlFor="llm-model-input">
                  <span>LLM model</span>
                  <HTMLSelect
                    id="llm-model-input"
                    options={LLM_MODEL_OPTIONS}
                    value={selectedLlmModel}
                    disabled={!!submitMessage || serverAsleep}
                    onChange={(event) => setSelectedLlmModel(event.target.value)}
                  />
                </label>
                <label className="setting-item" htmlFor="threshold-level-input">
                  <span>Sensitivity</span>
                  <HTMLSelect
                    id="threshold-level-input"
                    options={THRESHOLD_LEVEL_OPTIONS}
                    value={selectedThresholdLevel}
                    disabled={!!submitMessage || serverAsleep}
                    onChange={(event) => setSelectedThresholdLevel(event.target.value)}
                  />
                </label>
              </div>
            </Collapse>
          </Card>

          <Card className="panel result-panel" elevation={1}>
            <div className="result-header">
              <p className="section-title">AI Generated Draft</p>
              <div className="result-header-actions">
                {hasStagedEdits && !submitMessage && !draftChoices ? (
                  <Button
                    size="small"
                    text="Pre-check"
                    loading={isRescoring}
                    onClick={() => handleRecheck(previewParagraph)}
                  />
                ) : null}
                <span className="staged-chip">{stagedEditsCount} staged</span>
              </div>
            </div>

            {draftChoices ? (
              <div className="draft-choice-container">
                <p className="draft-choice-notice">
                  The first draft had high uncertainty ({(draftChoices.avgUncertainty * 100).toFixed(0)}%), so a second version was generated. Choose the one that reads better.
                </p>
                <div className="draft-choice-cards">
                  {draftChoices.drafts.map((draft, index) => (
                    <div key={index} className="draft-card">
                      <p className="draft-card-label">Draft {index === 0 ? "A" : "B"}</p>
                      <p className="draft-card-body">{draft.summary}</p>
                      <Button
                        className="draft-card-button"
                        text="I like this"
                        onClick={() => handleChooseDraft(draft)}
                      />
                    </div>
                  ))}
                </div>
              </div>
            ) : generatedSummary ? (
              <>
                <p className="summary-text">
                  {sentences.length > 0
                    ? sentences.map((item, index) => (
                        <button
                          key={`${index}-${item.sentence}`}
                          type="button"
                          className="sentence-button"
                          disabled={!!submitMessage || serverAsleep}
                          onClick={() => handleSentenceClick(item.sentence)}
                        >
                          <Tooltip
                            content={getTooltipText(item, showUncertainty, showAmbiguity)}
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
                {hasStagedEdits ? (
                  <div className="output-block">
                    <p className="section-title">Edited Preview</p>
                    <p className="paragraph-preview">
                      {rescoredSentences
                        ? rescoredSentences.map((item, index) => (
                            <Tooltip
                              key={`${index}-${item.sentence}`}
                              content={getTooltipText(item, showUncertainty, showAmbiguity)}
                              hoverOpenDelay={80}
                            >
                              <span className={`sentence-interactive ${showUncertainty ? getUnderlineClass(item) : ""} ${Object.values(acceptedEditsBySentence).includes(item.sentence) ? "edited-sentence-bold" : ""}`}>
                                {item.sentence}
                              </span>
                            </Tooltip>
                          ))
                        : previewSentences.length > 0
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
              </>
            ) : (
              <p className="placeholder-text">
                Generate a rewrite to see sentence-level uncertainty and begin editing.
              </p>
            )}
          </Card>
        </section>

        {editorialCards.length > 0 ? (
          <section className="cards-pane">
            <p className="section-title">Editorial Desk</p>
            <section className="cards-section">
              {editorialCards.map((card) => (
                <Card key={card.id} className="editorial-card" elevation={1}>
                  <div className="card-header">
                    <p className="card-timestamp muted">
                      Opened: {new Date(card.createdAt).toLocaleTimeString()}
                    </p>
                    <button
                      type="button"
                      className="card-dismiss"
                      aria-label="Dismiss"
                      onClick={() => handleRevertEdit(card.id)}
                    >×</button>
                  </div>
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
                        size="small"
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
                    <Button
                      intent="none"
                      text={card.isAccepted ? "Revert" : "Dismiss"}
                      onClick={() => handleRevertEdit(card.id)}
                    />
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

        {generatedSummary && !draftChoices && !submitMessage ? (
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

      </div>
    </main>
  );
}
