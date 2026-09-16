import { collectionLoanListQuerySchema, disbursementLoanListQuerySchema, sanctionLoanListQuerySchema } from '@lms/shared';

export function queueReturnPath(kind: 'sanction' | 'disbursement' | 'collection', search: Record<string, string | string[] | undefined>) {
  const schema = kind === 'sanction' ? sanctionLoanListQuerySchema : kind === 'disbursement' ? disbursementLoanListQuerySchema : collectionLoanListQuerySchema;
  const parsed = schema.safeParse(search);
  if (!parsed.success) return `/dashboard/${kind}`;
  const query = parsed.data;
  const params = new URLSearchParams({ page: String(query.page), limit: String(query.limit), status: query.status, ...(query.q ? { q: query.q } : {}) });
  return `/dashboard/${kind}?${params}`;
}
