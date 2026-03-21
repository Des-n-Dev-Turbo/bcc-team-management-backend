import * as z from '@zod/zod';

export const uuidSchema = z.string().trim().pipe(z.uuid());
export const nameSchema = z.string().trim().min(5).max(50);
