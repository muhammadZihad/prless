export type DiffSide = 'old' | 'new';

export type CommentStatus = 'open' | 'resolved';

export interface Comment {
  id: string;
  file: string; // repo-relative path
  line: number; // line number on the chosen side
  side: DiffSide; // which side of the diff the line belongs to
  snippet: string; // the line's text, for context + drift detection
  body: string;
  status: CommentStatus;
  createdAt: string; // ISO timestamp
  updatedAt: string; // ISO timestamp
}

export type NewComment = Pick<Comment, 'file' | 'line' | 'side' | 'body'> & {
  snippet?: string;
};

export type CommentPatch = Partial<Pick<Comment, 'body' | 'status'>>;

export type DiffMode = 'working' | 'staged' | 'compare';

export interface RefsResponse {
  current: string;
  branches: string[];
}

export interface DiffRequest {
  mode: DiffMode;
  base?: string;
  head?: string;
}

export interface DiffResponse {
  mode: DiffMode;
  base?: string;
  head?: string;
  raw: string; // unified diff text
}

export interface ExportResponse {
  path: string;
  count: number;
  content: string; // the rendered review.md — copied to the clipboard for pasting to an agent
}
