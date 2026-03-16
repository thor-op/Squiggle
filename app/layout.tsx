import type {Metadata} from 'next';
import { Fredoka, DM_Sans } from 'next/font/google';
import './globals.css'; // Global styles
import DevToolsMsg from '@/components/DevToolsMsg';

const fredoka = Fredoka({
  subsets: ['latin'],
  variable: '--font-fredoka',
});

const dmSans = DM_Sans({
  subsets: ['latin'],
  variable: '--font-dm-sans',
});

export const metadata: Metadata = {
  title: 'Squiggle - Multiplayer Drawing Game',
  description: 'A fun multiplayer drawing and guessing game',
};

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="en" className={`${fredoka.variable} ${dmSans.variable}`} suppressHydrationWarning>
      <body suppressHydrationWarning className="font-sans"><DevToolsMsg />{children}</body>
    </html>
  );
}
