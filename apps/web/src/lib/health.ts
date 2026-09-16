import { healthResponseSchema } from '@lms/shared';

export interface ServiceHealth {
  api: 'online' | 'offline';
  database: 'ready' | 'unavailable' | 'unknown';
  checkedAt: string;
}

export async function getServiceHealth(): Promise<ServiceHealth> {
  const checkedAt = new Date().toISOString();
  try {
    const response = await fetch('/api/v1/health', { cache: 'no-store', signal: AbortSignal.timeout(10000) });
    if (response.status === 503) return { api: 'online', database: 'unavailable', checkedAt };
    if (!response.ok) throw new Error('Service unavailable.');
    healthResponseSchema.parse(await response.json());
    return { api: 'online', database: 'ready', checkedAt };
  } catch {
    return { api: 'offline', database: 'unknown', checkedAt };
  }
}
