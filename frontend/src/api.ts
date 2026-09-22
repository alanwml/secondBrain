import type { ProviderStatus, Thought, ThoughtType } from "./types";

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
