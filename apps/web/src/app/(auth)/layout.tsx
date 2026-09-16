import { Brand } from '@/components/brand';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-dvh bg-white text-zinc-900">
    <header className="border-b border-zinc-200"><div className="mx-auto max-w-6xl px-5 py-6 sm:px-8"><Brand /></div></header>
    <main className="mx-auto w-full max-w-md px-6 py-12 sm:py-16">{children}</main>
  </div>;
}
