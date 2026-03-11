import { Button, Card, H3, HTMLSelect, TextArea } from "@blueprintjs/core";

export function App() {
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
        />
        <div className="actions-row">
          <HTMLSelect
            options={["shorten", "professional", "colloquial"]}
            value="shorten"
          />
          <Button intent="primary" text="Generate" />
        </div>
      </Card>
    </main>
  );
}
