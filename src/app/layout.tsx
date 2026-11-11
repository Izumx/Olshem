import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { AppProvider } from '@/components/AppProvider';
import { Shell } from '@/components/Shell';
// Fonts ship inside the build, so it works without internet at the venue.
import '@fontsource-variable/golos-text';
import '@fontsource-variable/caveat';
import './globals.css';

export const metadata: Metadata = {
  title: 'Өлшем: решения об учебниках и часах',
  description: 'Платформа для методистов: анализ результатов тестирования, сложные темы, сравнение учебников, распределение учебных часов.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ru">
      <body>
        <AppProvider>
          <Shell>{children}</Shell>
        </AppProvider>
      </body>
    </html>
  );
}
