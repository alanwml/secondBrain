export type ThoughtType = "note" | "task" | "idea";
export type AnalysisStatus = "none" | "queued" | "processing" | "completed" | "failed";

export interface Analysis {
  id: number;
  status: "completed" | "failed";
  summary: string;
  explanation: string;
  key_points: string[];
  contexts: unknown[];
  related_concepts: string[];
  related_notes: unknown[];
  sources: unknown[];
  images: unknown[];
  model: string;
  input_tokens: number | null;
  output_tokens: number | null;
  cost_usd: string | null;
  error_message: string;
  created_at: string;
  completed_at: string | null;
}

export interface Thought {
  id: string;
  text: string;
  type: ThoughtType;
  pinned: boolean;
  completed: boolean;
  selected_context: string | null;
  context_status: string;
  created_at: string;
  updated_at: string;
  latest_analysis: Analysis | null;
  analysis_status: AnalysisStatus;
}
