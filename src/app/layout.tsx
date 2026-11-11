import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { AppProvider } from '@/components/AppProvider';
import { Shell } from '@/components/Shell';
// Fonts ship inside the build, so it works without internet at the venue.
import '@fontsource-variable/golos-text';
import '@fontsource-variable/caveat';
import './globals.css';

const title = 'Өлшем: решения об учебниках и часах';
const description = 'Платформа для методистов: анализ результатов тестирования, сложные темы, сравнение учебников, распределение учебных часов.';

export const metadata: Metadata = {
  metadataBase: new URL('https://olshem.vercel.app'),
  title,
  description,
  applicationName: 'Өлшем',
  openGraph: { title, description, url: '/', siteName: 'Өлшем', locale: 'ru_RU', alternateLocale: ['kk_KZ'], type: 'website' },
  twitter: { card: 'summary_large_image', title, description },
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
