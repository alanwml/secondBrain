# Note Connections and Knowledge Graph Plan

## Purpose

Second Brain should make relationships between thoughts visible instead of leaving them implicit in search results or in the user's memory.

The proposed feature turns the existing collection of notes into a navigable knowledge graph:

- Notes are the graph's nodes.
- Connections between notes are the graph's edges.
- Each connection can explain why two notes are related.
- The graph can be explored visually, while the note view remains the primary place for reading and editing content.

This document describes the intended product behavior and an implementation plan. It is design documentation only; no application code is implemented as part of this document.

## The vision

Imagine capturing two thoughts weeks apart. One discusses HTMX, another discusses server-rendered interfaces, and a third describes a project architecture decision. Second Brain should eventually help reveal that these notes form a meaningful chain:

```text
HTMX ── uses ──> HTML over the wire ── relates to ──> Project architecture
```

The user should be able to:

1. See that a note has related notes.
2. Understand what each relationship means.
3. Open a connected note quickly.
4. Zoom out to see a cluster or the whole knowledge graph.
5. Discover indirect paths between ideas.
6. Correct, remove, or add relationships when the system is wrong or incomplete.

The graph should support thinking, not become a decorative visualization. The note itself, its content, and its readable related-note list should always remain usable without opening the graph view.

## Product principles

### 1. Explicit relationships are more valuable than visual proximity

The system should not imply that two notes are related merely because they appear close together on a canvas. Every visible edge should have a reason, even if that reason is simply “similar topic.”

### 2. The user remains in control

AI may suggest connections, but it should not silently create a large number of potentially misleading links. Suggestions should be reviewable, acceptible, dismissible, and reversible.

### 3. The graph must be useful at multiple scales

The interface should support:

- A small local neighborhood around one note.
- A filtered cluster, such as notes about a project or topic.
- A broader graph for discovery.

Showing every note and every edge at once will become noisy quickly, so filtering and focus mode are essential rather than optional polish.

### 4. Relationships need meaning

An edge should ideally answer “how are these notes connected?” Examples include:

- Same topic
- Builds on
- Contradicts
- Example of
- Related project
- Prerequisite for
- Follow-up to
- References
- Manually linked

The first release can use a smaller vocabulary, but the data model should support expansion.

### 5. Capture should stay fast

Creating a note should not require selecting tags, drawing lines, or classifying relationships. Connections can be suggested or added later from the note view.

## Proposed user experience

### A. Related notes in the note detail view

Every note detail modal or page should eventually contain a “Connections” section with:

- Directly connected notes.
- Relationship type.
- A short explanation of the connection.
- Whether the connection is confirmed, suggested, or manually created.
- Actions to open, edit, accept, dismiss, or remove the relationship.
- An action to add a connection manually.

Example:

```text
Connections

Builds on
  Server-rendered interfaces
  “This note extends the idea of returning HTML fragments from the server.”

Related topic
  Project architecture
  “Both notes discuss reducing client-side application state.”

[Add connection]
[View neighborhood]
```

### B. Focused graph view

The initial graph experience should open around the currently selected note rather than immediately rendering the entire database.

The focused view should show:

- The selected note in the center.
- Its direct neighbors around it.
- Optional second-degree neighbors.
- Edge labels or an explanation panel.
- A side panel for the selected node or edge.
- Controls for depth, relationship type, and confidence.
- Search or “focus on another note.”

Clicking a node should update the side panel and provide a clear action to open the full note. Double-clicking or an explicit “Open note” action can navigate to the note detail view.

### C. Full graph / graph exploration page

After the focused graph works, add a broader graph page for exploration. It should support:

- Zoom and pan.
- Search and focus.
- Filtering by note type, date, pinned state, project, tag, relationship type, and confidence.
- Hiding isolated notes.
- Showing only confirmed links or including suggestions.
- Resetting the layout.
- Opening a selected note.
- Returning to the previous focus.

The graph should not be the only way to access relationships. A list view and keyboard-accessible controls are necessary for usability and accessibility.

### D. Manual linking

The user should be able to create a connection without AI:

1. Choose “Add connection” from a note.
2. Search for a target note.
3. Select a relationship type, or choose “Related.”
4. Optionally add a short explanation.
5. Save.

Manual relationships should be treated as authoritative unless the user edits or removes them.

### E. AI suggestions

When a note is created or analyzed, the system may suggest connections to existing notes. Suggestions should appear in a reviewable area such as:

```text
Suggested connections

[Accept] [Dismiss]
Server-rendered interfaces
Likely related because both notes discuss HTML fragments replacing client-side rendering.
Confidence: High
```

The system should avoid automatically creating dozens of links. A practical starting rule is to show only the strongest few suggestions and require confirmation before they become visible as confirmed relationships.

## Relationship model

### Core entities

The hosted design should separate notes from connections. A connection is not merely a field on a note because it needs its own metadata, permissions, lifecycle, and explanation.

#### `thoughts`

The existing note entity remains the source of truth for user-created content.

Relevant existing fields include:

- `id`
- `user_id`
- `text`
- `type`
- `pinned`
- `completed`
- `created_at`
- `updated_at`

#### `note_connections`

Proposed fields:

```text
id
user_id
source_thought_id
target_thought_id
relationship_type
description
origin
status
confidence
created_by_user_id
created_at
updated_at
confirmed_at
deleted_at
```

Suggested meanings:

- `source_thought_id`: the originating note.
- `target_thought_id`: the related note.
- `relationship_type`: a controlled value such as `related`, `builds_on`, or `contradicts`.
- `description`: human-readable explanation of the relationship.
- `origin`: `manual`, `ai_suggested`, `ai_confirmed`, or `imported`.
- `status`: `suggested`, `confirmed`, `dismissed`, or `deleted`.
- `confidence`: optional numeric confidence from 0 to 1, primarily useful for AI suggestions.
- `user_id`: ownership boundary for Row Level Security.

### Directed versus undirected connections

The product should support both concepts even if the first UI presents them similarly.

- “Related to” is effectively undirected.
- “Builds on,” “contradicts,” “prerequisite for,” and “follow-up to” are directed.

The simplest implementation stores `source_thought_id` and `target_thought_id` for every edge. For undirected relationships, the UI can display the connection from either side, while the database enforces a canonical ordering or uniqueness rule to prevent accidental duplicates.

### Controlled relationship types

Start small:

```text
related
builds_on
example_of
contradicts
follow_up_to
```

The UI can initially expose “Related” as the default and add more types as real usage demonstrates that users need them. Relationship labels should be editable in one place rather than hard-coded throughout the frontend.

## How connections should be generated

### Phase 1: manual connections

Manual linking should come first because it validates whether the graph is useful before introducing AI complexity. It also gives the product a trustworthy baseline.

### Phase 2: AI suggestions from note analysis

After an AI analysis job completes, the worker can compare the note with candidate existing notes and return structured suggestions. The analysis response should eventually include data like:

```json
{
  "connectionSuggestions": [
    {
      "thoughtId": "existing-note-id",
      "relationshipType": "builds_on",
      "reason": "Both notes discuss returning HTML fragments from the server.",
      "confidence": 0.86
    }
  ]
}
```

The application should store these as `suggested` connections, not confirmed edges. The user can accept or dismiss them.

### Phase 3: stronger semantic retrieval

As the number of notes grows, comparing every new note with every existing note becomes expensive and noisy. Introduce a retrieval layer:

1. Create an embedding for each note or analysis summary.
2. Retrieve the closest candidate notes.
3. Ask the AI model to classify only those candidates.
4. Store the strongest suggestions for review.

This phase should be added only after the product has enough notes to justify the operational complexity and cost.

### Phase 4: graph-derived discovery

Once confirmed connections exist, the product can surface higher-level discoveries:

- Notes with many incoming links.
- Orphan notes with no connections.
- Bridges between otherwise separate clusters.
- Contradictory notes.
- Recently connected ideas.
- A path between two selected notes.

These are derived views and should not be stored as permanent relationships unless the user explicitly confirms them.

## Graph visualization approach

### Recommended first visualization

Use a force-directed graph for the focused neighborhood, with:

- Circles or cards for notes.
- Lines or arrows for connections.
- Color by note type or relationship category.
- A visual distinction between suggested and confirmed edges.
- A selected-node outline.
- A legend and text-based details panel.

Do not make the graph depend on color alone. Labels, icons, line styles, and the details panel should communicate the same distinctions.

### Avoiding graph overload

The graph should apply sensible defaults:

- Start with one hop from the selected note.
- Allow expansion to two hops.
- Hide dismissed suggestions.
- Hide isolated nodes by default in neighborhood mode.
- Limit the number of visible suggestions.
- Show edge details on selection rather than permanently labeling every line.
- Allow a list fallback for screen readers and keyboard users.

### Layout persistence

The first version does not need to persist coordinates. The layout should be reproducible enough for exploration, and the selected note should remain stable.

Later, users may want to arrange a project map manually. That is a separate feature and should not be coupled to the initial knowledge graph.

## Security and data ownership

Because the planned hosted product is multi-user, every connection must belong to a user and be protected by Row Level Security.

Required rules:

- A user can only read connections where `user_id` equals their authenticated identity.
- A user can only connect notes they are allowed to read.
- Deleting a note should delete or safely archive its connections.
- AI-generated suggestions must not leak note content across users.
- Provider requests should receive only the minimum note content needed for comparison.
- The service role key must remain server-side.

If shared notebooks or team spaces are added later, ownership should be generalized to a workspace or collection membership model rather than weakening per-user controls.

## Implementation plan

### Milestone 0: validate the interaction

Before database work, create a small product prototype or static interaction specification showing:

- Note detail with a Connections section.
- Add-connection flow.
- Focused graph around one note.
- Edge selection and explanation.
- Suggested versus confirmed styling.

The goal is to validate the mental model and avoid building a graph that looks impressive but is difficult to use.

### Milestone 1: data foundation

When the project begins the Supabase migration:

1. Add the `note_connections` table.
2. Add foreign keys to `thoughts` with appropriate delete behavior.
3. Add constraints for valid relationship types and statuses.
4. Add indexes for source, target, user, and status.
5. Add RLS policies for read, insert, update, and delete.
6. Add a uniqueness rule that prevents duplicate active connections.
7. Decide whether dismissed suggestions are retained for learning/audit purposes.

No visualization work should start until the data contract is stable enough for the frontend.

### Milestone 2: manual connection workflow

Implement the smallest end-to-end feature:

1. Add a connection from a note to another note.
2. Display confirmed connections in the note detail view.
3. Edit or remove a connection.
4. Navigate from one note to the other.
5. Test ownership and deletion behavior with multiple users.

This milestone provides value even if AI suggestions are disabled.

### Milestone 3: focused neighborhood graph

Add a graph view for one selected note:

1. Fetch the selected note and its direct connections.
2. Render nodes and edges.
3. Select nodes and edges.
4. Show accessible text details outside the canvas.
5. Open the selected note from the graph.
6. Add filters for relationship type and connection status.
7. Support one-hop and two-hop expansion.

The graph library should be selected based on accessibility, bundle size, touch support, and the ability to render a useful fallback—not only on visual quality.

### Milestone 4: AI connection suggestions

Extend the existing analysis pipeline:

1. Retrieve a small set of candidate notes.
2. Ask the model to identify meaningful relationships.
3. Validate the structured response.
4. Store suggestions as pending connections.
5. Present them in the note view.
6. Let the user accept or dismiss each suggestion.
7. Record enough metadata to diagnose poor suggestions and cost.

The AI should never be the only source of truth for whether a connection exists.

### Milestone 5: graph exploration and derived insights

After usage validates the focused graph:

- Add a full graph page.
- Add cluster and topic filters.
- Add paths between notes.
- Add orphan and highly connected note views.
- Add contradiction and bridge-note discovery.
- Consider embeddings and vector search if the note collection has grown enough.

## API shape

The eventual hosted API should expose connection-specific operations rather than embedding all connection behavior in the thoughts endpoint.

Example endpoints:

```text
GET    /api/thoughts/:id/connections
POST   /api/thoughts/:id/connections
PATCH  /api/connections/:id
DELETE /api/connections/:id
POST   /api/connections/:id/accept
POST   /api/connections/:id/dismiss
GET    /api/graph?focus=:thoughtId&depth=1
```

The graph endpoint should return a graph-shaped payload so the frontend does not need to reconstruct the network from many unrelated requests:

```json
{
  "nodes": [],
  "edges": [],
  "focusThoughtId": "...",
  "depth": 1
}
```

The exact API can change during the Supabase migration, but the separation between note operations and connection operations should remain.

## Testing strategy

### Data and security

- A user cannot read another user's connections.
- A user cannot connect to another user's note.
- Duplicate active links are rejected.
- Deleting a note handles its connections correctly.
- Dismissed suggestions do not reappear unexpectedly.

### Product behavior

- A manually connected note appears in both notes' connection views.
- Removing a link updates both sides.
- Selecting a graph node opens the correct note.
- Filters change the visible graph without losing the focus note.
- A graph with no connections has a clear empty state.
- A large graph remains usable through depth and filtering controls.

### AI quality

Maintain a small evaluation set of notes and expected relationships. Track:

- Acceptance rate of suggestions.
- Dismissal rate.
- False-positive examples.
- Useful connections discovered only through AI.
- Average analysis cost per note.

Acceptance rate should not be treated as the only success metric; a small number of high-value suggestions may be better than many mediocre ones.

## Decisions to make before implementation

The following choices should be settled during the design/prototype milestone:

1. Should “Related” connections be displayed as undirected lines while typed relationships use arrows?
2. Which relationship types belong in the first release?
3. Should users be able to create connections only between their own notes, or eventually across shared workspaces?
4. Should AI suggestions require explicit acceptance before appearing in the graph?
5. Should the graph default to the current note's neighborhood or open as a separate top-level page?
6. Which graph library best balances accessibility, touch interaction, performance, and maintainability?
7. Should connection explanations be editable by the user, AI-generated, or both?
8. How should imported or migrated notes receive initial connections?

## Recommended starting point

The recommended sequence is:

1. Prototype the note-detail Connections section and focused graph interaction.
2. Add manual connections to the future Supabase data model.
3. Display and navigate confirmed connections.
4. Add AI suggestions only after manual linking feels useful.
5. Expand to full-graph discovery after the focused neighborhood is reliable.

This keeps the feature grounded in real note-taking behavior and prevents the visualization from becoming disconnected from the core workflow.
