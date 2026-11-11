import type { Metadata } from 'next';
import { Caveat, Golos_Text } from 'next/font/google';
import type { ReactNode } from 'react';
import { AppProvider } from '@/components/AppProvider';
import { Shell } from '@/components/Shell';
import './globals.css';

const golos = Golos_Text({
  subsets: ['latin', 'cyrillic', 'cyrillic-ext'],
  variable: '--font-golos',
  display: 'swap',
});

const caveat = Caveat({
  subsets: ['latin', 'cyrillic', 'cyrillic-ext'],
  weight: ['500', '600'],
  variable: '--font-caveat',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Өлшем: решения об учебниках и часах',
  description: 'Платформа для методистов: анализ результатов тестирования, сложные темы, сравнение учебников, распределение учебных часов.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ru" className={`${golos.variable} ${caveat.variable}`}>
      <body>
        <AppProvider>
          <Shell>{children}</Shell>
        </AppProvider>
      </body>
    </html>
  );
}
