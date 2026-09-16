'use client';

import { useEffect, useState } from 'react';
import { LogOut, LoaderCircle } from 'lucide-react';
import { authResponseSchema, roleHome, type UserDTO } from '@lms/shared';
import { logout } from '@/lib/auth-client';
import { useHydrated } from '@/lib/use-hydrated';

export function SessionControls({ user }: { user: UserDTO }) {
  const hydrated = useHydrated();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    async function checkSession() {
      try {
        const response = await fetch('/api/v1/auth/me', { cache: 'no-store', signal: AbortSignal.timeout(10000) });
        if (!active) return;
        if (response.status === 401) { window.location.replace('/login?reason=session-expired'); return; }
        if (response.ok) {
          const current = authResponseSchema.parse(await response.json()).data;
          if (active && (current.id !== user.id || current.role !== user.role)) window.location.replace(roleHome(current.role));
        }
      } catch {}
    }
    function onVisible() { if (document.visibilityState === 'visible') void checkSession(); }
    function onPageShow(event: PageTransitionEvent) { if (event.persisted) void checkSession(); }
    const interval = window.setInterval(() => { void checkSession(); }, 60000);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('pageshow', onPageShow);
    return () => {
      active = false; window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible); window.removeEventListener('pageshow', onPageShow);
    };
  }, [user.id, user.role]);
  async function signOut() {
    setPending(true); setError('');
    try { await logout(); window.location.replace('/login'); }
    catch { setError('Sign out failed. Please retry.'); setPending(false); }
  }
  return <div className="flex shrink-0 flex-col items-end gap-1">
    <button type="button" onClick={() => { void signOut(); }} disabled={!hydrated || pending} title="Sign out" aria-label="Sign out"
      className="flex min-h-10 items-center justify-center gap-2 rounded-md border border-zinc-300 px-3 text-sm text-zinc-700 hover:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-teal-700 disabled:opacity-50">
      {pending ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <LogOut className="size-4" aria-hidden="true" />}
      <span className="hidden sm:inline">Sign out</span>
    </button>
    {error && <p role="alert" className="max-w-36 text-right text-xs text-red-700">{error}</p>}
  </div>;
}
