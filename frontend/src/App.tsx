import { FormEvent, useEffect, useMemo, useState } from "react";

import { createConnection, createThought, deleteConnection, deleteThought, getConnections, getGraph, getProviderStatus, getThoughts, requestAnalysis, selectContext, updateThought } from "./api";
import type { GraphData, NoteConnection, ProviderStatus, RelationshipType, Thought, ThoughtType } from "./types";

type View = "all" | "inbox" | "tasks" | "ideas" | "pinned";

const viewTitles: Record<View, string> = {
  all: "All thoughts",
  inbox: "Inbox",
  tasks: "Tasks",
  ideas: "Ideas",
  pinned: "Pinned",
};

const relationshipLabels: Record<RelationshipType, string> = { related: "Related", builds_on: "Builds on", example_of: "Example of", contradicts: "Contradicts", follow_up_to: "Follow-up to" };

function KnowledgeGraph({ data, focusId, depth, relationshipType, thoughtType, includeSuggested, onFocus, onClose, onDepthChange, onRelationshipChange, onThoughtTypeChange, onSuggestedChange }: { data: GraphData | null; focusId: string | null; depth: number; relationshipType: RelationshipType | ""; thoughtType: ThoughtType | ""; includeSuggested: boolean; onFocus: (id: string) => void; onClose: () => void; onDepthChange: (depth: number) => void; onRelationshipChange: (value: RelationshipType | "") => void; onThoughtTypeChange: (value: ThoughtType | "") => void; onSuggestedChange: (value: boolean) => void }) {
  const width = 760;
  const height = 480;
  const center = data?.nodes.find((node) => node.id === focusId) ?? data?.nodes[0];
  const others = (data?.nodes ?? []).filter((node) => node.id !== center?.id);
  const positions = new Map<string, { x: number; y: number }>();
  if (center) positions.set(center.id, { x: width / 2, y: height / 2 });
  others.forEach((node, index) => { const angle = (index / Math.max(others.length, 1)) * Math.PI * 2 - Math.PI / 2; const radius = others.length > 8 ? 175 : 145; positions.set(node.id, { x: width / 2 + Math.cos(angle) * radius, y: height / 2 + Math.sin(angle) * radius }); });
  return <div className="graph-backdrop"><section className="graph-modal" role="dialog" aria-modal="true" aria-labelledby="graph-title"><header className="graph-header"><div><p className="eyebrow">KNOWLEDGE GRAPH</p><h2 id="graph-title">{focusId ? "Explore this neighborhood" : "Explore all connections"}</h2><p>{data?.nodes.length ?? 0} notes · {data?.edges.length ?? 0} connections</p></div><button className="detail-close" onClick={onClose} aria-label="Close graph">×</button></header><div className="graph-controls"><label>Depth <select value={depth} onChange={(event) => onDepthChange(Number(event.target.value))}><option value="1">1 hop</option><option value="2">2 hops</option><option value="3">3 hops</option></select></label><label>Relationship <select value={relationshipType} onChange={(event) => onRelationshipChange(event.target.value as RelationshipType | "")}><option value="">All types</option>{Object.entries(relationshipLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label><label>Note type <select value={thoughtType} onChange={(event) => onThoughtTypeChange(event.target.value as ThoughtType | "")}><option value="">All notes</option><option value="note">Notes</option><option value="idea">Ideas</option><option value="task">Tasks</option></select></label><label className="graph-check"><input type="checkbox" checked={includeSuggested} onChange={(event) => onSuggestedChange(event.target.checked)} /> Include suggestions</label></div><div className="graph-canvas"><svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Interactive knowledge graph">{data?.edges.map((edge) => { const source = positions.get(edge.source_thought_id); const target = positions.get(edge.target_thought_id); return source && target ? <line key={edge.id} x1={source.x} y1={source.y} x2={target.x} y2={target.y} className={`graph-edge ${edge.status}`} /> : null; })}{data?.nodes.map((node) => { const point = positions.get(node.id); return point ? <g key={node.id} className="graph-node" onClick={() => onFocus(node.id)} tabIndex={0} role="button"><circle cx={point.x} cy={point.y} r={node.id === focusId ? 31 : 25} className={`${node.type} ${node.id === focusId ? "focused" : ""}`} /><text x={point.x} y={point.y + 46} textAnchor="middle">{node.text.slice(0, 24)}{node.text.length > 24 ? "…" : ""}</text></g> : null; })}</svg></div><div className="graph-node-list"><strong>Visible notes</strong>{data?.nodes.map((node) => <button key={node.id} className={node.id === focusId ? "selected" : ""} onClick={() => onFocus(node.id)}><span className={`tag ${node.type}`}>{node.type}</span>{node.text}</button>)}</div></section></div>;
}

function App() {
  const [thoughts, setThoughts] = useState<Thought[]>([]);
  const [view, setView] = useState<View>("all");
  const [text, setText] = useState("");
  const [type, setType] = useState<ThoughtType>("note");
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedThoughtId, setSelectedThoughtId] = useState<string | null>(null);
  const [customContext, setCustomContext] = useState("");
  const [isSavingContext, setIsSavingContext] = useState(false);
  const [analysisConfirmation, setAnalysisConfirmation] = useState<Thought | null>(null);
  const [dontAskAgain, setDontAskAgain] = useState(() => localStorage.getItem("second-brain:skip-analysis-confirmation") === "true");
  const [providerStatus, setProviderStatus] = useState<ProviderStatus | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [connections, setConnections] = useState<NoteConnection[]>([]);
  const [connectionType, setConnectionType] = useState<RelationshipType>("related");
  const [connectionTargetId, setConnectionTargetId] = useState("");
  const [connectionDescription, setConnectionDescription] = useState("");
  const [isGraphOpen, setIsGraphOpen] = useState(false);
  const [graphFocusId, setGraphFocusId] = useState<string | null>(null);
  const [graphData, setGraphData] = useState<GraphData | null>(null);
  const [graphDepth, setGraphDepth] = useState(1);
  const [graphRelationship, setGraphRelationship] = useState<RelationshipType | "">("");
  const [graphThoughtType, setGraphThoughtType] = useState<ThoughtType | "">("");
  const [includeSuggested, setIncludeSuggested] = useState(true);

  const selectedThought = thoughts.find((thought) => thought.id === selectedThoughtId) ?? null;
  const hasActiveAnalysis = thoughts.some((thought) => thought.analysis_status === "queued" || thought.analysis_status === "processing");

  useEffect(() => {
    getThoughts()
      .then(setThoughts)
      .catch((loadError: Error) => setError(loadError.message))
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    getProviderStatus().then(setProviderStatus).catch(() => setProviderStatus(null));
  }, []);

  useEffect(() => {
    if (!selectedThoughtId) { setConnections([]); return; }
    getConnections(selectedThoughtId).then(setConnections).catch((connectionError: Error) => setError(connectionError.message));
  }, [selectedThoughtId]);

  useEffect(() => {
    if (!isGraphOpen) return;
    getGraph({ focus: graphFocusId ?? undefined, depth: graphDepth, relationship_type: graphRelationship, thought_type: graphThoughtType, include_suggested: includeSuggested }).then(setGraphData).catch((graphError: Error) => setError(graphError.message));
  }, [graphDepth, graphFocusId, graphRelationship, graphThoughtType, includeSuggested, isGraphOpen]);

  useEffect(() => {
    if (!hasActiveAnalysis) return;
    const interval = window.setInterval(() => {
      getThoughts().then(setThoughts).catch(() => undefined);
    }, 2500);
    return () => window.clearInterval(interval);
  }, [hasActiveAnalysis]);

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
    if (!dontAskAgain) {
      setAnalysisConfirmation(thought);
      return;
    }
    await confirmAnalysis(thought);
  }

  async function confirmAnalysis(thought: Thought) {
    setAnalysisConfirmation(null);
    localStorage.setItem("second-brain:skip-analysis-confirmation", String(dontAskAgain));
    try {
      await requestAnalysis(thought.id);
      setThoughts((current) => current.map((item) => item.id === thought.id ? { ...item, analysis_status: "queued" } : item));
    } catch (analysisError) {
      setError((analysisError as Error).message);
    }
  }

  async function handleContextChoice(thought: Thought, context: string) {
    if (isSavingContext || thought.context_decision_made) return;
    if (!context.trim()) {
      setError("Enter a context before saving it.");
      return;
    }
    setIsSavingContext(true);
    try {
      const updated = await selectContext(thought.id, context);
      setThoughts((current) => current.map((item) => item.id === updated.id ? updated : item));
      setCustomContext("");
    } catch (contextError) {
      setError((contextError as Error).message);
    } finally {
      setIsSavingContext(false);
    }
  }

  async function handleCreateConnection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedThoughtId || !connectionTargetId || connectionTargetId === selectedThoughtId) return;
    try {
      const created = await createConnection(selectedThoughtId, { target_thought_id: connectionTargetId, relationship_type: connectionType, description: connectionDescription.trim() });
      setConnections((current) => [created, ...current.filter((item) => item.id !== created.id)]);
      setConnectionTargetId(""); setConnectionDescription("");
    } catch (connectionError) { setError((connectionError as Error).message); }
  }

  async function handleDeleteConnection(connection: NoteConnection) {
    try { await deleteConnection(connection.id); setConnections((current) => current.filter((item) => item.id !== connection.id)); }
    catch (connectionError) { setError((connectionError as Error).message); }
  }

  function openThought(thought: Thought) {
    setSelectedThoughtId(thought.id);
  }

  function openGraph(focusId: string | null = null) {
    setGraphFocusId(focusId); setGraphData(null); setIsGraphOpen(true);
  }

  function closeThought() {
    setSelectedThoughtId(null);
  }

  function thoughtTypeIcon(thoughtType: ThoughtType) {
    if (thoughtType === "task") return "✓";
    if (thoughtType === "idea") return "✧";
    return "▤";
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
        <button className={`settings-link ${showSettings ? "active" : ""}`} onClick={() => setShowSettings((current) => !current)}>Settings</button>
        {showSettings && <section className="settings-panel" aria-label="Settings"><p className="eyebrow">AI PROVIDER</p><strong>{providerStatus?.provider ?? "Provider status unavailable"}</strong><p>{providerStatus?.configured ? `Ready · ${providerStatus.model}` : "Not configured"}</p><small>{providerStatus?.base_url ?? "Check the Django backend"}</small><label className="settings-checkbox"><input type="checkbox" checked={dontAskAgain} onChange={(event) => { setDontAskAgain(event.target.checked); localStorage.setItem("second-brain:skip-analysis-confirmation", String(event.target.checked)); }} /> Don’t ask before AI analysis</label></section>}
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div><p className="eyebrow">DJANGO + REACT MIGRATION</p><h1>{viewTitles[view]}</h1></div><button className="graph-launch-button" onClick={() => openGraph()}>◎ Knowledge graph</button>
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
            <div className="detail-heading"><p className="eyebrow">THOUGHT DETAILS</p><h2 id="detail-title">{selectedThought.text}</h2></div>
            <div className="detail-badges"><span className={`detail-type-badge ${selectedThought.type}`}><span aria-hidden="true">{thoughtTypeIcon(selectedThought.type)}</span>{selectedThought.type}</span><span className={`detail-status ${selectedThought.analysis_status}`}><span className="status-dot" aria-hidden="true" />{selectedThought.analysis_status === "completed" ? "Analyzed" : selectedThought.analysis_status}</span></div>
          </div>

          {selectedThought.latest_analysis ? <div className="full-analysis">
            <div className="full-analysis-heading"><span className="analysis-preview-icon" aria-hidden="true">✦</span><div><p className="eyebrow">AI ANALYSIS</p><h3>{selectedThought.latest_analysis.summary || "Analysis"}</h3></div></div>
            {selectedThought.latest_analysis.explanation && <section><h4>Explanation</h4><p className="analysis-explanation">{selectedThought.latest_analysis.explanation}</p></section>}
            {selectedThought.latest_analysis.contexts.length > 0 && selectedThought.context_status === "needs-selection" && !selectedThought.context_decision_made && <section className="context-section"><div className="context-heading"><div><h4>Choose a context</h4><p>This choice is saved once and will not trigger another analysis.</p></div><span className="context-status needs-selection">Needs selection</span></div><div className="context-options">{selectedThought.latest_analysis.contexts.map((context) => <button disabled={isSavingContext} className="context-option" key={context.name} onClick={() => handleContextChoice(selectedThought, context.name)}><span className="context-option-top"><strong>{context.name}</strong><span>{Math.round(context.confidence * 100)}% likely</span></span><span>{context.summary}</span>{context.example && <small>Example: {context.example}</small>}</button>)}</div><div className="custom-context-option"><label htmlFor="custom-context">Your own context</label><textarea id="custom-context" value={customContext} onChange={(event) => setCustomContext(event.target.value)} placeholder="Describe what this thought means to you…" rows={3} disabled={isSavingContext} /><button className="primary-button" disabled={isSavingContext || !customContext.trim()} onClick={() => handleContextChoice(selectedThought, customContext)}>{isSavingContext ? "Saving…" : "Save custom context"}</button></div></section>}
            {selectedThought.context_decision_made && selectedThought.selected_context && <div className="saved-context"><span className="saved-context-icon" aria-hidden="true">✓</span><div><p className="eyebrow">CONTEXT SELECTED</p><strong>{selectedThought.selected_context}</strong></div></div>}
            {selectedThought.latest_analysis.key_points.length > 0 && <section><h4>Key points</h4><ul>{selectedThought.latest_analysis.key_points.map((point, index) => <li key={`${point}-${index}`}>{point}</li>)}</ul></section>}
            {selectedThought.latest_analysis.related_concepts.length > 0 && <section><h4>Related concepts</h4><div className="concept-list">{selectedThought.latest_analysis.related_concepts.map((concept) => <span key={concept}>{concept}</span>)}</div></section>}
            {selectedThought.latest_analysis.related_notes.length > 0 && <section><h4>Related notes</h4><div className="related-note-list">{selectedThought.latest_analysis.related_notes.map((note, index) => { const item = note as { id?: string; text?: string; type?: string }; return <div className="related-note" key={item.id ?? index}><span className="tag">{item.type ?? "note"}</span><span>{item.text ?? "Related thought"}</span></div>; })}</div></section>}
            {selectedThought.latest_analysis.images.length > 0 && <section><h4>Source previews</h4><div className="image-grid">{selectedThought.latest_analysis.images.map((image, index) => { const item = image as { title?: string; url?: string; imageUrl?: string }; return item.imageUrl ? <a href={item.url} target="_blank" rel="noreferrer" key={`${item.imageUrl}-${index}`}><img src={item.imageUrl} alt="" /><span>{item.title ?? "Source"}</span></a> : null; })}</div></section>}
            {selectedThought.latest_analysis.sources.length > 0 && <section><h4>Sources</h4><div className="source-list">{selectedThought.latest_analysis.sources.map((source, index) => { const item = source as { title?: string; url?: string }; return item.url ? <a href={item.url} target="_blank" rel="noreferrer" key={`${item.url}-${index}`}>{item.title || item.url}<small>{item.url}</small></a> : null; })}</div></section>}
            <div className="analysis-metadata"><span>Runs: {selectedThought.analysis_runs}</span><span>Total input: {selectedThought.total_input_tokens.toLocaleString()}</span><span>Total output: {selectedThought.total_output_tokens.toLocaleString()}</span><span>Total cost: ${selectedThought.total_cost_usd}</span></div>
          </div> : <div className="no-analysis-detail"><span className="analysis-preview-icon" aria-hidden="true">✦</span><div><h3>{selectedThought.analysis_status === "failed" ? "Analysis failed" : "No full analysis yet"}</h3><p>{selectedThought.analysis_error || (selectedThought.analysis_status === "queued" ? "This thought is waiting in the analysis queue." : selectedThought.analysis_status === "processing" ? "This thought is being analyzed now." : "Run AI analysis to generate an explanation and key points.")}</p></div>{selectedThought.type !== "task" && selectedThought.analysis_status === "none" && <button className="primary-button" onClick={() => handleAnalysis(selectedThought)}>Analyze thought</button>}{selectedThought.analysis_status === "failed" && <button className="primary-button" onClick={() => handleAnalysis(selectedThought)}>Try again</button>}</div>}
          <section className="connections-section"><div className="connections-heading"><div><h4>Connections</h4><p>Manual links between this thought and the rest of your knowledge.</p></div><button className="secondary-button" onClick={() => openGraph(selectedThought.id)}>View neighborhood</button></div>{connections.length === 0 ? <p className="muted-copy">No connections yet. Add one below.</p> : <div className="connection-list">{connections.map((connection) => { const otherId = connection.source_thought_id === selectedThought.id ? connection.target_thought_id : connection.source_thought_id; const otherText = connection.source_thought_id === selectedThought.id ? connection.target_text : connection.source_text; const otherType = connection.source_thought_id === selectedThought.id ? connection.target_type : connection.source_type; return <div className="connection-row" key={connection.id}><button className="connection-note" onClick={() => { const target = thoughts.find((item) => item.id === otherId); if (target) openThought(target); }}><span className={`tag ${otherType}`}>{otherType}</span><strong>{otherText}</strong><small>{relationshipLabels[connection.relationship_type]}{connection.description ? ` · ${connection.description}` : ""}</small></button><button className="connection-delete" onClick={() => handleDeleteConnection(connection)} aria-label="Delete connection">×</button></div>; })}</div>}<form className="connection-form" onSubmit={handleCreateConnection}><select value={connectionTargetId} onChange={(event) => setConnectionTargetId(event.target.value)} aria-label="Choose note to connect"><option value="">Choose a note…</option>{thoughts.filter((item) => item.id !== selectedThought.id).map((item) => <option value={item.id} key={item.id}>{item.text.slice(0, 70)}</option>)}</select><select value={connectionType} onChange={(event) => setConnectionType(event.target.value as RelationshipType)} aria-label="Relationship type">{Object.entries(relationshipLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select><input value={connectionDescription} onChange={(event) => setConnectionDescription(event.target.value)} placeholder="Why are these connected? (optional)" /><button className="primary-button" type="submit" disabled={!connectionTargetId}>Add connection</button></form></section>
        </section>
      </div>}
      {analysisConfirmation && <div className="confirmation-backdrop" role="presentation"><section className="confirmation-modal" role="dialog" aria-modal="true" aria-labelledby="confirm-analysis-title"><button className="detail-close" onClick={() => setAnalysisConfirmation(null)} aria-label="Cancel analysis">×</button><span className="analysis-preview-icon" aria-hidden="true">✦</span><h2 id="confirm-analysis-title">Analyze this thought with AI?</h2><p>Its content will be sent to your configured AI provider to generate an explanation, related notes, and sources.</p><div className="confirmation-thought">{analysisConfirmation.text}</div><label className="settings-checkbox"><input type="checkbox" checked={dontAskAgain} onChange={(event) => setDontAskAgain(event.target.checked)} /> Don’t ask me again</label><div className="confirmation-actions"><button className="secondary-button" onClick={() => setAnalysisConfirmation(null)}>Cancel</button><button className="primary-button" onClick={() => confirmAnalysis(analysisConfirmation)}>Analyze thought</button></div></section></div>}
      {isGraphOpen && <KnowledgeGraph data={graphData} focusId={graphFocusId} depth={graphDepth} relationshipType={graphRelationship} thoughtType={graphThoughtType} includeSuggested={includeSuggested} onFocus={setGraphFocusId} onClose={() => setIsGraphOpen(false)} onDepthChange={setGraphDepth} onRelationshipChange={setGraphRelationship} onThoughtTypeChange={setGraphThoughtType} onSuggestedChange={setIncludeSuggested} />}
    </div>
  );
}

export default App;
