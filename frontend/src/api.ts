import type { GraphData, NoteConnection, ProviderStatus, RelationshipType, Thought, ThoughtType } from "./types";

interface CreateThoughtInput {
  text: string;
  type: ThoughtType;
  request_analysis: boolean;
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error?.message ?? body?.detail ?? body?.message ?? `Request failed (${response.status})`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export function getThoughts(): Promise<Thought[]> {
  return request<Thought[]>("/api/thoughts/");
}

export function createThought(input: CreateThoughtInput): Promise<Thought> {
  return request<Thought>("/api/thoughts/", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateThought(id: string, changes: Partial<Thought>): Promise<Thought> {
  return request<Thought>(`/api/thoughts/${id}/`, {
    method: "PATCH",
    body: JSON.stringify(changes),
  });
}

export function deleteThought(id: string): Promise<void> {
  return request<void>(`/api/thoughts/${id}/`, { method: "DELETE" });
}

export function requestAnalysis(id: string): Promise<unknown> {
  return request<unknown>(`/api/thoughts/${id}/analysis/`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export function selectContext(id: string, context: string): Promise<Thought> {
  return request<Thought>(`/api/thoughts/${id}/context/`, {
    method: "POST",
    body: JSON.stringify({ context }),
  });
}

export function getProviderStatus(): Promise<ProviderStatus> {
  return request<ProviderStatus>("/api/settings/provider/");
}

export function getConnections(id: string): Promise<NoteConnection[]> {
  return request<NoteConnection[]>(`/api/thoughts/${id}/connections/`);
}

export function createConnection(id: string, input: { target_thought_id: string; relationship_type: RelationshipType; description: string }): Promise<NoteConnection> {
  return request<NoteConnection>(`/api/thoughts/${id}/connections/`, { method: "POST", body: JSON.stringify(input) });
}

export function deleteConnection(id: number): Promise<void> {
  return request<void>(`/api/connections/${id}/`, { method: "DELETE" });
}

export function getGraph(params: { focus?: string; depth: number; relationship_type?: RelationshipType | ""; thought_type?: ThoughtType | ""; include_suggested: boolean }): Promise<GraphData> {
  const query = new URLSearchParams({ depth: String(params.depth), include_suggested: String(params.include_suggested) });
  if (params.focus) query.set("focus", params.focus);
  if (params.relationship_type) query.set("relationship_type", params.relationship_type);
  if (params.thought_type) query.set("thought_type", params.thought_type);
  return request<GraphData>(`/api/graph/?${query.toString()}`);
}
