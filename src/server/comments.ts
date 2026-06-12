import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Comment, CommentPatch, NewComment } from '../shared/types.js';

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
    try {
      const raw = await readFile(this.file, 'utf8');
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as Comment[]) : [];
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }
      throw err;
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
    await writeFile(this.file, JSON.stringify(comments, null, 2) + '\n', 'utf8');
  }
}
