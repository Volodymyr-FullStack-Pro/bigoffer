'use client';

import { MotionConfig } from 'motion/react';
import { ThemeProvider, useTheme } from 'next-themes';
import type { ReactNode } from 'react';
import { Toaster } from 'sonner';
import { ConfirmProvider } from '@/components/ui/confirm';

/** App-wide pop-up notifications (saved, errors, tips), styled with the theme tokens. */
function AppToaster() {
  const { resolvedTheme } = useTheme();
  return (
    <Toaster
      theme={resolvedTheme === 'light' ? 'light' : 'dark'}
      position="bottom-right"
      closeButton
      richColors
      toastOptions={{
        style: { borderRadius: '14px', border: '1px solid var(--border)', fontFamily: 'var(--font-geist), system-ui, sans-serif' },
      }}
    />
  );
}

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
      {/* Every motion animation honours the OS "reduce motion" setting. */}
      <MotionConfig reducedMotion="user">
        <ConfirmProvider>{children}</ConfirmProvider>
      </MotionConfig>
      <AppToaster />
    </ThemeProvider>
  );
}
