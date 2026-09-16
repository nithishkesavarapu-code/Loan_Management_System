'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, CircleAlert, Database, RefreshCw, Server } from 'lucide-react';
import { getServiceHealth, type ServiceHealth } from '@/lib/health';

export function ServiceStatus() {
  const [health, setHealth] = useState<ServiceHealth | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    let active = true;
    void getServiceHealth().then((result) => { if (active) setHealth(result); });
    return () => { active = false; };
  }, []);

  async function refresh() {
    setRefreshing(true);
    setHealth(await getServiceHealth());
    setRefreshing(false);
  }

  const loading = health === null || refreshing;
  const healthy = health?.api === 'online' && health.database === 'ready';
  const summary = loading ? 'Checking services' : healthy ? 'All systems operational' : 'Service interruption';
  const StatusIcon = healthy ? CheckCircle2 : CircleAlert;

  return (
    <section aria-label="Service status" className="mt-10 max-w-2xl">
      <div className="flex min-h-16 items-center gap-3 border-b border-zinc-200 pb-5">
        {loading ? <RefreshCw aria-hidden="true" className="size-5 shrink-0 animate-spin text-zinc-500" />
          : <StatusIcon aria-hidden="true" className={`size-5 shrink-0 ${healthy ? 'text-teal-700' : 'text-amber-700'}`} />}
        <h2 className="text-base font-medium" role="status">{summary}</h2>
        <button
          type="button" onClick={() => { void refresh(); }} disabled={loading}
          aria-label="Refresh status" title="Refresh status"
          className="ml-auto flex size-10 shrink-0 items-center justify-center rounded-md border border-zinc-200 text-zinc-600 hover:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 disabled:opacity-40"
        >
          <RefreshCw className={`size-4 ${refreshing ? 'animate-spin' : ''}`} aria-hidden="true" />
        </button>
      </div>
      <dl className="divide-y divide-zinc-100">
        <div className="flex min-h-20 items-center justify-between gap-4 py-4">
          <dt className="flex items-center gap-3 text-sm"><Server className="size-4 text-zinc-400" aria-hidden="true" />Application service</dt>
          <dd className={`text-sm font-medium ${health?.api === 'online' ? 'text-teal-700' : 'text-zinc-500'}`}>
            {loading ? 'Checking' : health?.api === 'online' ? 'Online' : 'Unavailable'}
          </dd>
        </div>
        <div className="flex min-h-20 items-center justify-between gap-4 py-4">
          <dt className="flex items-center gap-3 text-sm"><Database className="size-4 text-zinc-400" aria-hidden="true" />Database</dt>
          <dd className={`text-sm font-medium ${health?.database === 'ready' ? 'text-teal-700' : 'text-zinc-500'}`}>
            {loading ? 'Checking' : health?.database === 'ready' ? 'Connected' : health?.database === 'unavailable' ? 'Unavailable' : 'Unknown'}
          </dd>
        </div>
      </dl>
      <p className="mt-5 min-h-5 text-xs text-zinc-500">
        {health ? `Last checked ${new Intl.DateTimeFormat('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date(health.checkedAt))}` : 'Checking availability'}
      </p>
    </section>
  );
}
