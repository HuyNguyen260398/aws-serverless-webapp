import type { ReactNode } from 'react';
import '@aws-amplify/ui-react/styles.css';

export const metadata = {
  title: 'Todo',
  description: 'Serverless todo app',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
