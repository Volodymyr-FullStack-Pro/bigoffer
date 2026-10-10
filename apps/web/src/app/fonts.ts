import { JetBrains_Mono } from 'next/font/google';

const jetbrains = JetBrains_Mono({ subsets: ['latin', 'cyrillic'], weight: ['400', '500', '700'], variable: '--font-jetbrains', display: 'swap' });

export const fontVariables = jetbrains.variable;
