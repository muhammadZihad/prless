import { z } from 'zod';

export const DiffQuerySchema = z
  .object({
    mode: z.enum(['working', 'staged', 'compare']).default('working'),
    base: z.string().min(1).optional(),
    head: z.string().min(1).optional(),
  })
  .refine((q) => q.mode !== 'compare' || (!!q.base && !!q.head), {
    message: 'compare mode requires both base and head',
  });

export const CreateCommentSchema = z.object({
  file: z.string().min(1),
  line: z.number().int().positive(),
  side: z.enum(['old', 'new']),
  body: z.string().min(1),
  snippet: z.string().optional(),
  beforeContext: z.array(z.string()).optional(),
  afterContext: z.array(z.string()).optional(),
  hunkHeader: z.string().optional(),
});

export const PatchCommentSchema = z
  .object({
    body: z.string().min(1).optional(),
    status: z.enum(['open', 'resolved']).optional(),
  })
  .refine((p) => p.body !== undefined || p.status !== undefined, {
    message: 'at least one of body or status is required',
  });

/** Flatten a ZodError into a single human-readable message. */
export function formatZodError(error: z.ZodError): string {
  return error.issues
    .map((i) => {
      const path = i.path.join('.');
      return path ? `${path}: ${i.message}` : i.message;
    })
    .join('; ');
}
