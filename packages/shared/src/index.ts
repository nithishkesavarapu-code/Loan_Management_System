import { z } from 'zod';

export * from './constants.js';
export * from './auth.js';
export * from './dates.js';
export * from './money.js';
export * from './applications.js';
export * from './pagination.js';
export * from './sales.js';
export * from './loans.js';

export interface ApiSuccess<T> { data: T }
export interface ApiError {
  error: {
    code: string;
    message: string;
    fields?: Record<string, string[]>;
    meta?: { loanId: string };
  };
}

export const healthResponseSchema = z.strictObject({
  data: z.strictObject({ status: z.literal('ok'), database: z.literal('connected') }),
});
export type HealthResponse = z.infer<typeof healthResponseSchema>;
export type HealthDTO = HealthResponse['data'];
