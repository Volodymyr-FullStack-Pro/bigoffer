import { JetBrains_Mono, Manrope } from 'next/font/google';

// Manrope for UI text (geometric, Cyrillic), JetBrains Mono for accents: dates, counters, scores, eyebrow labels.
const manrope = Manrope({ subsets: ['latin', 'cyrillic'], weight: ['400', '500', '600', '700', '800'], variable: '--font-manrope', display: 'swap' });
const jetbrains = JetBrains_Mono({ subsets: ['latin', 'cyrillic'], weight: ['400', '500', '700'], variable: '--font-jetbrains', display: 'swap' });

export const fontVariables = `${manrope.variable} ${jetbrains.variable}`;
