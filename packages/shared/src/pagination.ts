import { z } from 'zod';
import { applicationStates } from './constants.js';
import { applicationSchema } from './applications.js';

const queryInteger = z.string().regex(/^\d+$/, 'Use a positive integer.').transform(Number).pipe(z.number().int().positive());
export const paginationQueryFields = { page: queryInteger.default(1), limit: queryInteger.pipe(z.number().max(100)).default(20) };
export const applicationListQuerySchema = z.strictObject({ ...paginationQueryFields, state: z.enum(applicationStates).optional() });
export const salesListQuerySchema = z.strictObject({ ...paginationQueryFields, q: z.string().trim().min(1).max(100).optional() });
export type ApplicationListQuery = z.infer<typeof applicationListQuerySchema>;
export type SalesListQuery = z.infer<typeof salesListQuerySchema>;
export interface Page<T> { data: T[]; pagination: { page: number; limit: number; total: number } }
export function pageSchema<T extends z.ZodType>(item: T) {
  return z.strictObject({ data: z.array(item), pagination: z.strictObject({ page: z.number().int().positive(), limit: z.number().int().min(1).max(100), total: z.number().int().nonnegative() }) });
}
export const applicationPageSchema = pageSchema(applicationSchema);
export function pageOffset({ page, limit }: { page: number; limit: number }): number {
  const offset = BigInt(page - 1) * BigInt(limit);
  return Number(offset > BigInt(Number.MAX_SAFE_INTEGER) ? BigInt(Number.MAX_SAFE_INTEGER) : offset);
}
