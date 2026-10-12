import localFont from 'next/font/local';

// Manrope for UI text (geometric, Cyrillic), JetBrains Mono for accents: dates, counters, scores, eyebrow labels.
// Self-hosted variable fonts (Latin + Cyrillic subsets, OFL): builds and CI never depend on fetching Google Fonts.
const manrope = localFont({ src: './fonts/Manrope.woff2', weight: '200 800', variable: '--font-manrope', display: 'swap' });
const jetbrains = localFont({ src: './fonts/JetBrainsMono.woff2', weight: '100 800', variable: '--font-jetbrains', display: 'swap' });

export const fontVariables = `${manrope.variable} ${jetbrains.variable}`;
