import localFont from 'next/font/local';

// Geist (Vercel, OFL) for all UI text, Latin and Cyrillic; JetBrains Mono only for code.
// Self-hosted variable fonts: builds and CI never depend on fetching Google Fonts.
const geist = localFont({ src: './fonts/Geist.woff2', weight: '100 900', variable: '--font-geist', display: 'swap' });
const jetbrains = localFont({ src: './fonts/JetBrainsMono.woff2', weight: '100 800', variable: '--font-jetbrains', display: 'swap' });

export const fontVariables = `${geist.variable} ${jetbrains.variable}`;
