import { Inter } from 'next/font/google';

// Fallback for non-Apple devices; Apple devices render SF Pro via the system stack (see globals.css).
const inter = Inter({ subsets: ['latin', 'cyrillic'], variable: '--font-inter', display: 'swap' });

export const fontVariables = inter.variable;
