import { z } from 'zod';

export const DiffQuerySchema = z
  .object({
    mode: z.enum(['working', 'staged', 'compare']).default('working'),
    base: z.string().min(1).optional(),
    head: z.string().min(1).optional(),
    // Query params arrive as strings; only an explicit "false" disables it.
    unstaged: z
      .enum(['true', 'false'])
      .optional()
      .transform((v) => v !== 'false'),
  })
  .refine((q) => q.mode !== 'compare' || (!!q.base && !!q.head), {
    message: 'compare mode requires both base and head',
  });

export const CreateCommentSchema = z
  .object({
    file: z.string().min(1),
    scope: z.enum(['line', 'file']).optional(),
    line: z.number().int().positive().optional(),
    endLine: z.number().int().positive().optional(),
    side: z.enum(['old', 'new']).optional(),
    body: z.string().min(1),
    snippet: z.string().optional(),
    beforeContext: z.array(z.string()).optional(),
    afterContext: z.array(z.string()).optional(),
    hunkHeader: z.string().optional(),
  })
  .refine((d) => d.scope === 'file' || (d.line !== undefined && d.side !== undefined), {
    message: 'line and side are required for line comments',
  });

export const PatchCommentSchema = z
  .object({
    body: z.string().min(1).optional(),
    status: z.enum(['open', 'resolved']).optional(),
  })
  .refine((p) => p.body !== undefined || p.status !== undefined, {
    message: 'at least one of body or status is required',
  });

export const ExportOptionsSchema = z
  .object({
    format: z.enum(['markdown', 'checklist', 'json']).optional(),
    profile: z.enum(['generic', 'claude', 'codex', 'cursor']).optional(),
    includeResolved: z.boolean().optional(),
    commentIds: z.array(z.string()).optional(),
  })
  .default({});

/** Flatten a ZodError into a single human-readable message. */
export function formatZodError(error: z.ZodError): string {
  return error.issues
    .map((i) => {
      const path = i.path.join('.');
      return path ? `${path}: ${i.message}` : i.message;
    })
    .join('; ');
}
