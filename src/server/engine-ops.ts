import type {
  Comment,
  DiffResponse,
  ExportResponse,
  RefsResponse,
} from '../shared/types.js';
import { exportReview } from './export.js';
import { getDiff, getRefs } from './git.js';
import { loadIgnore } from './ignore.js';
import {
  CreateCommentSchema,
  DiffQuerySchema,
  ExportOptionsSchema,
  PatchCommentSchema,
  formatZodError,
} from './schemas.js';
import type { ActiveRepo } from './session.js';

/** Thrown when input fails Zod validation. Transports map this to HTTP 400. */
export class ValidationError extends Error {}

export async function getRefsOp(repo: ActiveRepo): Promise<RefsResponse> {
  return getRefs(repo.git);
}

export async function getDiffOp(
  repo: ActiveRepo,
  paths: string[],
  query: unknown,
): Promise<DiffResponse> {
  const parsed = DiffQuerySchema.safeParse(query ?? {});
  if (!parsed.success) throw new ValidationError(formatZodError(parsed.error));
  const { mode, base, head } = parsed.data;
  const ig = await loadIgnore(repo.repoRoot);
  return getDiff(repo.git, { mode, base, head, ig, paths, repoRoot: repo.repoRoot });
}

export async function listCommentsOp(repo: ActiveRepo): Promise<Comment[]> {
  return repo.store.list();
}

export async function createCommentOp(repo: ActiveRepo, body: unknown): Promise<Comment> {
  const parsed = CreateCommentSchema.safeParse(body);
  if (!parsed.success) throw new ValidationError(formatZodError(parsed.error));
  return repo.store.add(parsed.data);
}

export async function patchCommentOp(
  repo: ActiveRepo,
  id: string,
  body: unknown,
): Promise<Comment | null> {
  const parsed = PatchCommentSchema.safeParse(body);
  if (!parsed.success) throw new ValidationError(formatZodError(parsed.error));
  return repo.store.patch(id, parsed.data);
}

export async function deleteCommentOp(repo: ActiveRepo, id: string): Promise<boolean> {
  return repo.store.remove(id);
}

export async function runExportOp(
  repo: ActiveRepo,
  paths: string[],
  body: unknown,
  now: string,
): Promise<ExportResponse> {
  const parsed = ExportOptionsSchema.safeParse(body ?? {});
  if (!parsed.success) throw new ValidationError(formatZodError(parsed.error));
  const ig = await loadIgnore(repo.repoRoot);
  const all = await repo.store.list();
  // Don't export comments on files hidden by .prlessignore.
  const comments = ig ? all.filter((c) => !ig.ignores(c.file)) : all;
  // Use the working-tree diff as the reference for orphan detection.
  const diff = await getDiff(repo.git, {
    mode: 'working',
    ig,
    paths,
    repoRoot: repo.repoRoot,
  });
  return exportReview(repo.repoRoot, comments, { options: parsed.data, rawDiff: diff.raw }, now);
}
