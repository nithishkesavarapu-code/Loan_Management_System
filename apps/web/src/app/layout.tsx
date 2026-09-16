import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Loan Management System',
  description: 'Loan application and operations workspace.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
