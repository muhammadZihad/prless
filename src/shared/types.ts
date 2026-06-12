export type DiffSide = 'old' | 'new';

export type CommentStatus = 'open' | 'resolved';

/** 'line' comments anchor to a diff line; 'file' comments apply to the whole file. */
export type CommentScope = 'line' | 'file';

export interface Comment {
  id: string;
  file: string; // repo-relative path
  line: number; // line number on the chosen side (0 for file-scope comments)
  side: DiffSide; // which side of the diff the line belongs to (ignored for file scope)
  snippet: string; // the line's text, for context + drift detection
  body: string;
  status: CommentStatus;
  scope?: CommentScope; // defaults to 'line' when absent (pre-v0.4 comments)
  createdAt: string; // ISO timestamp
  updatedAt: string; // ISO timestamp
  // Durable anchor context — lets a comment be re-located and drift-checked
  // when line numbers shift. Optional for back-compat with pre-v0.4 comments.
  beforeContext?: string[]; // a few lines above the anchor
  afterContext?: string[]; // a few lines below the anchor
  hunkHeader?: string; // the @@ -a,b +c,d @@ header of the containing hunk
}

/** Current on-disk schema version for .prless/comments.json. */
export const COMMENTS_SCHEMA_VERSION = 1;

/** Versioned envelope persisted to .prless/comments.json. */
export interface CommentsFile {
  version: number;
  comments: Comment[];
}

export type NewComment = Pick<Comment, 'file' | 'body'> & {
  // line/side are required for line comments and omitted for file comments.
  line?: number;
  side?: DiffSide;
  scope?: CommentScope;
  snippet?: string;
  beforeContext?: string[];
  afterContext?: string[];
  hunkHeader?: string;
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
  untracked: string[]; // untracked files not included in the diff (working mode)
  ignored: string[]; // files hidden by .prlessignore
}

export interface ExportResponse {
  path: string;
  count: number;
  content: string; // the rendered review.md — copied to the clipboard for pasting to an agent
}
