import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  COMMENTS_SCHEMA_VERSION,
  type Comment,
  type CommentPatch,
  type CommentsFile,
  type NewComment,
} from '../shared/types.js';

export class CommentStore {
  private readonly dir: string;
  private readonly file: string;

  constructor(repoRoot: string) {
    this.dir = path.join(repoRoot, '.prless');
    this.file = path.join(this.dir, 'comments.json');
  }

  get filePath(): string {
    return this.file;
  }

  async list(): Promise<Comment[]> {
    let raw: string;
    try {
      raw = await readFile(this.file, 'utf8');
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }
      throw err;
    }

    try {
      const parsed: unknown = JSON.parse(raw);
      // Legacy format: a bare array of comments (pre-v1). Upgraded on next save.
      if (Array.isArray(parsed)) {
        return parsed as Comment[];
      }
      // Versioned envelope: { version, comments }.
      if (
        parsed !== null &&
        typeof parsed === 'object' &&
        Array.isArray((parsed as CommentsFile).comments)
      ) {
        return (parsed as CommentsFile).comments;
      }
      // Parsed, but an unexpected shape — treat as corrupt.
      await this.backupCorrupted();
      return [];
    } catch {
      // Invalid JSON.
      await this.backupCorrupted();
      return [];
    }
  }

  async add(input: NewComment): Promise<Comment> {
    const comments = await this.list();
    const now = new Date().toISOString();
    const comment: Comment = {
      id: randomUUID(),
      file: input.file,
      line: input.line,
      side: input.side,
      snippet: input.snippet ?? '',
      body: input.body,
      status: 'open',
      createdAt: now,
      updatedAt: now,
      ...(input.beforeContext ? { beforeContext: input.beforeContext } : {}),
      ...(input.afterContext ? { afterContext: input.afterContext } : {}),
      ...(input.hunkHeader ? { hunkHeader: input.hunkHeader } : {}),
    };
    comments.push(comment);
    await this.save(comments);
    return comment;
  }

  async patch(id: string, patch: CommentPatch): Promise<Comment | null> {
    const comments = await this.list();
    const idx = comments.findIndex((c) => c.id === id);
    if (idx === -1) return null;

    const existing = comments[idx];
    const updated: Comment = {
      ...existing,
      body: patch.body ?? existing.body,
      status: patch.status ?? existing.status,
      updatedAt: new Date().toISOString(),
    };
    comments[idx] = updated;
    await this.save(comments);
    return updated;
  }

  async remove(id: string): Promise<boolean> {
    const comments = await this.list();
    const next = comments.filter((c) => c.id !== id);
    if (next.length === comments.length) return false;
    await this.save(next);
    return true;
  }

  private async save(comments: Comment[]): Promise<void> {
    await mkdir(this.dir, { recursive: true });
    const payload: CommentsFile = { version: COMMENTS_SCHEMA_VERSION, comments };
    // Write to a temp file then rename, so a crash mid-write can't corrupt the
    // existing comments.json (rename is atomic on the same filesystem).
    const tmp = `${this.file}.tmp`;
    await writeFile(tmp, JSON.stringify(payload, null, 2) + '\n', 'utf8');
    await rename(tmp, this.file);
  }

  /** Move an unreadable comments.json aside so the user can recover it. */
  private async backupCorrupted(): Promise<void> {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backup = path.join(this.dir, `comments.corrupted.${stamp}.json`);
    try {
      await rename(this.file, backup);
      console.error(
        `prless: ${this.file} contained invalid data. A backup was created at ${backup}. Starting with an empty comment list.`,
      );
    } catch {
      // Best effort — recovery should never block the review.
    }
  }
}
