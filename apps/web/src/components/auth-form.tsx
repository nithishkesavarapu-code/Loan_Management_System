'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { ArrowRight, Eye, EyeOff, LoaderCircle } from 'lucide-react';
import { authRequestSchema, roleHome } from '@lms/shared';
import { authenticate, AuthError } from '@/lib/auth-client';
import { useHydrated } from '@/lib/use-hydrated';

export function AuthForm({ mode }: { mode: 'login' | 'register' }) {
  const registering = mode === 'register';
  const hydrated = useHydrated();
  const [visible, setVisible] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const [fields, setFields] = useState<Record<string, string[]>>({});

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setMessage(''); setFields({});
    const data = new FormData(event.currentTarget);
    const input = authRequestSchema.safeParse({ email: data.get('email'), password: data.get('password') });
    if (!input.success) {
      const errors: Record<string, string[]> = {};
      for (const issue of input.error.issues) (errors[issue.path.join('.')] ??= []).push(issue.message);
      setFields(errors); return;
    }
    if (registering && data.get('confirmPassword') !== input.data.password) {
      setFields({ confirmPassword: ['Passwords do not match.'] }); return;
    }
    setPending(true);
    try {
      const user = await authenticate(mode, input.data);
      window.location.replace(roleHome(user.role));
    } catch (error) {
      setMessage(error instanceof AuthError ? error.message : 'The account service is unavailable. Please try again.');
      if (error instanceof AuthError) setFields(error.fields);
      setPending(false);
    }
  }
  const inputClass = 'mt-2 h-12 w-full rounded-md border border-zinc-300 bg-white px-3 text-base outline-none focus:border-teal-700 focus:ring-2 focus:ring-teal-700/15 aria-invalid:border-red-600';
  function fieldError(field: string) {
    return fields[field]?.length ? <p id={`${field}-error`} role="alert" className="mt-2 text-sm text-red-700">{fields[field]?.[0]}</p> : null;
  }
  return <form method="post" onSubmit={(event) => { void submit(event); }} noValidate className="mt-7 space-y-5">
    <noscript><p role="alert" className="text-sm text-red-700">JavaScript is required to sign in.</p></noscript>
    <div>
      <label htmlFor="email" className="text-sm font-medium">Email address</label>
      <input id="email" name="email" type="email" autoComplete="email" autoCapitalize="none" spellCheck={false}
        required disabled={!hydrated || pending} className={inputClass} aria-invalid={!!fields.email} aria-describedby={fields.email ? 'email-error' : undefined} />
      {fieldError('email')}
    </div>
    <div>
      <label htmlFor="password" className="text-sm font-medium">Password</label>
      <div className="relative">
        <input id="password" name="password" type={visible ? 'text' : 'password'} autoComplete={registering ? 'new-password' : 'current-password'}
          required disabled={!hydrated || pending} className={`${inputClass} pr-14`} aria-invalid={!!fields.password} aria-describedby={fields.password ? 'password-error' : undefined} />
        <button type="button" disabled={!hydrated} onClick={() => setVisible(!visible)} aria-label={visible ? 'Hide password' : 'Show password'}
          title={visible ? 'Hide password' : 'Show password'} aria-pressed={visible}
          className="absolute right-1 bottom-1 flex size-10 items-center justify-center rounded text-zinc-500 hover:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-teal-700">
          {visible ? <EyeOff className="size-5" aria-hidden="true" /> : <Eye className="size-5" aria-hidden="true" />}
        </button>
      </div>
      {fieldError('password')}
    </div>
    {registering && <div>
      <label htmlFor="confirmPassword" className="text-sm font-medium">Confirm password</label>
      <input id="confirmPassword" name="confirmPassword" type={visible ? 'text' : 'password'} autoComplete="new-password"
        required disabled={!hydrated || pending} className={inputClass} aria-invalid={!!fields.confirmPassword} aria-describedby={fields.confirmPassword ? 'confirmPassword-error' : undefined} />
      {fieldError('confirmPassword')}
    </div>}
    {message && <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-3 text-sm text-red-800">{message}</p>}
    <button type="submit" disabled={!hydrated || pending} className="flex min-h-12 w-full items-center justify-center gap-3 rounded-md bg-teal-800 px-4 py-3 text-sm font-semibold text-white hover:bg-teal-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 disabled:opacity-60">
      {pending ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <ArrowRight className="size-4" aria-hidden="true" />}
      {pending ? (registering ? 'Creating account' : 'Signing in') : (registering ? 'Create borrower account' : 'Sign in')}
    </button>
    <p className="pt-2 text-center text-sm text-zinc-600">
      {registering ? 'Already have an account? ' : 'New borrower? '}
      <Link href={registering ? '/login' : '/register'} className="font-medium text-teal-800 underline underline-offset-4">{registering ? 'Sign in' : 'Create an account'}</Link>
    </p>
  </form>;
}
