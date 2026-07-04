import type { ReactNode } from 'react';
import { Inter } from 'next/font/google';
import './globals.css';
import '@aws-amplify/ui-react/styles.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata = {
  title: 'Todo',
  description: 'Serverless todo app',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={inter.className}>
      <body className="bg-gray-50 text-gray-900 dark:bg-gray-900 dark:text-gray-100">{children}</body>
    </html>
  );
}
