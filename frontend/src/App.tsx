import { FormEvent, useEffect, useMemo, useState } from "react";

import { createThought, deleteThought, getThoughts, requestAnalysis, updateThought } from "./api";
import type { Thought, ThoughtType } from "./types";

type View = "all" | "inbox" | "tasks" | "ideas" | "pinned";

const viewTitles: Record<View, string> = {
  all: "All thoughts",
  inbox: "Inbox",
  tasks: "Tasks",
  ideas: "Ideas",
  pinned: "Pinned",
};

function App() {
  const [thoughts, setThoughts] = useState<Thought[]>([]);
  const [view, setView] = useState<View>("all");
  const [text, setText] = useState("");
  const [type, setType] = useState<ThoughtType>("note");
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedThoughtId, setSelectedThoughtId] = useState<string | null>(null);

  const selectedThought = thoughts.find((thought) => thought.id === selectedThoughtId) ?? null;

  useEffect(() => {
    getThoughts()
      .then(setThoughts)
      .catch((loadError: Error) => setError(loadError.message))
      .finally(() => setIsLoading(false));
  }, []);

  const visibleThoughts = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return thoughts.filter((thought) => {
      const matchesView =
        view === "all" ||
        (view === "inbox" && !thought.completed) ||
        (view === "tasks" && thought.type === "task") ||
        (view === "ideas" && thought.type === "idea") ||
        (view === "pinned" && thought.pinned);
      const matchesSearch = !normalizedSearch || thought.text.toLowerCase().includes(normalizedSearch);
      return matchesView && matchesSearch;
    });
  }, [search, thoughts, view]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!text.trim()) return;

    try {
      const created = await createThought({ text: text.trim(), type, request_analysis: false });
      setThoughts((current) => [created, ...current]);
      setText("");
    } catch (submitError) {
      setError((submitError as Error).message);
    }
  }

  async function toggleThought(thought: Thought, field: "completed" | "pinned") {
    try {
      const updated = await updateThought(thought.id, { [field]: !thought[field] });
      setThoughts((current) => current.map((item) => (item.id === updated.id ? updated : item)));
    } catch (updateError) {
      setError((updateError as Error).message);
    }
  }

  async function handleDelete(thought: Thought) {
    try {
      await deleteThought(thought.id);
      setThoughts((current) => current.filter((item) => item.id !== thought.id));
    } catch (deleteError) {
      setError((deleteError as Error).message);
    }
  }

  async function handleAnalysis(thought: Thought) {
    if (thought.analysis_status === "completed" || thought.analysis_status === "queued" || thought.analysis_status === "processing") return;
    try {
      await requestAnalysis(thought.id);
      setThoughts((current) => current.map((item) => item.id === thought.id ? { ...item, analysis_status: "queued" } : item));
    } catch (analysisError) {
      setError((analysisError as Error).message);
    }
  }

  function openThought(thought: Thought) {
    setSelectedThoughtId(thought.id);
  }

  function closeThought() {
    setSelectedThoughtId(null);
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark">✦</span><span>Second Brain</span></div>
        <p className="tagline">A calm place for everything on your mind.</p>
        <nav aria-label="Main navigation">
          {(Object.keys(viewTitles) as View[]).map((item) => (
            <button className={`nav-item ${view === item ? "active" : ""}`} key={item} onClick={() => setView(item)}>
              {viewTitles[item]}
            </button>
          ))}
        </nav>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div><p className="eyebrow">DJANGO + REACT MIGRATION</p><h1>{viewTitles[view]}</h1></div>
        </header>

        <section className="capture-card">
          <div className="capture-heading">What’s on your mind?</div>
          <form onSubmit={handleSubmit}>
            <textarea value={text} onChange={(event) => setText(event.target.value)} rows={3} placeholder="Capture a thought, task, idea, or anything you don't want to lose…" />
            <div className="capture-actions">
              <div className="type-picker" role="group" aria-label="Thought type">
                {(["note", "task", "idea"] as ThoughtType[]).map((item) => <button type="button" className={type === item ? "selected" : ""} key={item} onClick={() => setType(item)}>{item}</button>)}
              </div>
              <button className="primary-button" type="submit">Capture thought</button>
            </div>
          </form>
        </section>

        <section className="toolbar">
          <input value={search} onChange={(event) => setSearch(event.target.value)} type="search" placeholder="Search your thoughts…" />
        </section>

        {error && <div className="error-message" role="alert">{error}</div>}
        {isLoading ? <p>Loading thoughts…</p> : visibleThoughts.length === 0 ? <section className="empty-state"><h2>Your mind is clear here.</h2><p>Capture your first thought above.</p></section> : <section className="thought-list">{visibleThoughts.map((thought) => <article className="thought-card" key={thought.id}>
          <div className="thought-content" role="button" tabIndex={0} onClick={() => openThought(thought)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") openThought(thought); }} title="Open full thought and analysis">
            <div className="thought-meta"><span className={`tag ${thought.type}`}>{thought.type}</span><span>{new Date(thought.created_at).toLocaleString()}</span><span className="open-hint">Open details →</span></div>
            <p className={thought.completed ? "completed" : ""}>{thought.text}</p>
          </div>
          <div className="card-actions" aria-label="Thought actions">
            <div className="primary-actions">
              <button className={`action-button complete-action ${thought.completed ? "is-active" : ""}`} title={thought.completed ? "Mark as incomplete" : "Mark as complete"} aria-label={thought.completed ? "Mark as incomplete" : "Mark as complete"} onClick={() => toggleThought(thought, "completed")}>
                <span className="action-icon" aria-hidden="true">✓</span><span>{thought.completed ? "Completed" : "Complete"}</span>
              </button>
              <button className={`action-button pin-action ${thought.pinned ? "is-active" : ""}`} title={thought.pinned ? "Remove pin" : "Pin thought"} aria-label={thought.pinned ? "Remove pin" : "Pin thought"} onClick={() => toggleThought(thought, "pinned")}>
                <span className="action-icon" aria-hidden="true">⚑</span><span>{thought.pinned ? "Pinned" : "Pin"}</span>
              </button>
            {thought.type !== "task" && <button className={`action-button analyze-action ${thought.analysis_status === "completed" ? "is-complete" : ""}`} disabled={thought.analysis_status === "completed" || thought.analysis_status === "queued" || thought.analysis_status === "processing"} title={thought.analysis_status === "completed" ? "Analysis completed" : thought.analysis_status === "queued" || thought.analysis_status === "processing" ? "Analysis is already running" : "Analyze this thought with AI"} aria-label={thought.analysis_status === "completed" ? "Analysis completed" : "Analyze this thought with AI"} onClick={() => handleAnalysis(thought)}>
                <span className="action-icon" aria-hidden="true">{thought.analysis_status === "completed" ? "✓" : "✦"}</span><span>{thought.analysis_status === "completed" ? "Analyzed" : thought.analysis_status === "processing" ? "Analyzing…" : thought.analysis_status === "queued" ? "Queued" : "Analyze"}</span>
              </button>}
            </div>
            <button className="action-button delete-action" title="Delete thought" aria-label="Delete thought" onClick={() => handleDelete(thought)}>
              <span className="action-icon" aria-hidden="true">×</span><span>Delete</span>
            </button>
          </div>
          {thought.analysis_status !== "none" && <div className={`analysis-status ${thought.analysis_status}`}>
            <span className="status-dot" aria-hidden="true" />
            <span>{thought.analysis_status === "completed" ? "Analysis complete" : thought.analysis_status === "processing" ? "Analysis in progress" : thought.analysis_status === "queued" ? "Waiting in analysis queue" : "Analysis failed"}</span>
            {thought.analysis_status === "failed" && <span className="status-help">You can try again.</span>}
          </div>}
          {thought.latest_analysis?.summary && <div className="analysis-preview"><span className="analysis-preview-icon" aria-hidden="true">✦</span><p>{thought.latest_analysis.summary}</p></div>}
        </article>)}</section>}
      </main>

      {selectedThought && <div className="detail-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeThought(); }}>
        <section className="detail-modal" role="dialog" aria-modal="true" aria-labelledby="detail-title">
          <button className="detail-close" onClick={closeThought} aria-label="Close thought details">×</button>
          <div className="detail-header">
            <div><p className="eyebrow">THOUGHT DETAILS</p><h2 id="detail-title">{selectedThought.type}</h2></div>
            <span className={`tag ${selectedThought.type}`}>{selectedThought.analysis_status === "completed" ? "Analyzed" : selectedThought.analysis_status}</span>
          </div>
          <p className="detail-original">{selectedThought.text}</p>

          {selectedThought.latest_analysis ? <div className="full-analysis">
            <div className="full-analysis-heading"><span className="analysis-preview-icon" aria-hidden="true">✦</span><div><p className="eyebrow">AI ANALYSIS</p><h3>{selectedThought.latest_analysis.summary || "Analysis"}</h3></div></div>
            {selectedThought.latest_analysis.explanation && <section><h4>Explanation</h4><p className="analysis-explanation">{selectedThought.latest_analysis.explanation}</p></section>}
            {selectedThought.latest_analysis.key_points.length > 0 && <section><h4>Key points</h4><ul>{selectedThought.latest_analysis.key_points.map((point, index) => <li key={`${point}-${index}`}>{point}</li>)}</ul></section>}
            {selectedThought.latest_analysis.related_concepts.length > 0 && <section><h4>Related concepts</h4><div className="concept-list">{selectedThought.latest_analysis.related_concepts.map((concept) => <span key={concept}>{concept}</span>)}</div></section>}
            {selectedThought.latest_analysis.sources.length > 0 && <section><h4>Sources</h4><div className="source-list">{selectedThought.latest_analysis.sources.map((source, index) => { const item = source as { title?: string; url?: string }; return item.url ? <a href={item.url} target="_blank" rel="noreferrer" key={`${item.url}-${index}`}>{item.title || item.url}<small>{item.url}</small></a> : null; })}</div></section>}
            <div className="analysis-metadata"><span>Model: {selectedThought.latest_analysis.model || "Unknown"}</span><span>In: {selectedThought.latest_analysis.input_tokens ?? "—"}</span><span>Out: {selectedThought.latest_analysis.output_tokens ?? "—"}</span></div>
          </div> : <div className="no-analysis-detail"><span className="analysis-preview-icon" aria-hidden="true">✦</span><div><h3>No full analysis yet</h3><p>{selectedThought.analysis_status === "queued" ? "This thought is waiting in the analysis queue." : "Run AI analysis to generate an explanation and key points."}</p></div>{selectedThought.type !== "task" && selectedThought.analysis_status === "none" && <button className="primary-button" onClick={() => handleAnalysis(selectedThought)}>Analyze thought</button>}</div>}
        </section>
      </div>}
    </div>
  );
}

export default App;
