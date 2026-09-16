import { z } from 'zod';
import { roles, type Role } from './constants.js';

export const SESSION_COOKIE = 'lms_session';
export const emailSchema = z.string().trim().toLowerCase().max(254).pipe(z.email());
export const passwordSchema = z.string()
  .refine((value) => Array.from(value).length >= 8, 'Use at least 8 characters.')
  .refine((value) => new TextEncoder().encode(value).length <= 72, 'Use at most 72 UTF-8 bytes.');
export const authRequestSchema = z.strictObject({ email: emailSchema, password: passwordSchema });
export type AuthRequest = z.infer<typeof authRequestSchema>;
export const userSchema = z.strictObject({
  id: z.string().regex(/^[a-f\d]{24}$/i),
  email: emailSchema,
  role: z.enum(roles),
  createdAt: z.iso.datetime(),
});
export const authResponseSchema = z.strictObject({ data: userSchema });
export type UserDTO = z.infer<typeof userSchema>;

export const roleLabels: Record<Role, string> = {
  ADMIN: 'Administrator', SALES: 'Sales', SANCTION: 'Sanction',
  DISBURSEMENT: 'Disbursement', COLLECTION: 'Collection', BORROWER: 'Borrower',
};
export const dashboardModules = ['sales', 'sanction', 'disbursement', 'collection'] as const;
export type DashboardModule = (typeof dashboardModules)[number];
export const moduleRoles = {
  sales: ['SALES', 'ADMIN'], sanction: ['SANCTION', 'ADMIN'],
  disbursement: ['DISBURSEMENT', 'ADMIN'], collection: ['COLLECTION', 'ADMIN'],
} as const satisfies Record<DashboardModule, readonly Role[]>;
export const moduleLabels: Record<DashboardModule, string> = {
  sales: 'Sales', sanction: 'Sanction', disbursement: 'Disbursement', collection: 'Collection',
};
export function canAccessModule(role: Role, module: DashboardModule): boolean {
  return (moduleRoles[module] as readonly Role[]).includes(role);
}
export function roleHome(role: Role): string {
  return role === 'BORROWER' ? '/borrower' : `/dashboard/${role === 'ADMIN' ? 'sales' : role.toLowerCase()}`;
}
