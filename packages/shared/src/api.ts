import { z } from 'zod';

export const apiErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  details: z.unknown().optional()
});

export interface ApiMeta { requestId: string }
export type ApiResponse<T> =
  | { success: true; data: T; error: null; meta: ApiMeta }
  | { success: false; data: null; error: z.infer<typeof apiErrorSchema>; meta: ApiMeta };
