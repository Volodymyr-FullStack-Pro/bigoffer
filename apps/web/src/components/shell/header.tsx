import { LogOut } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { setLocaleAction, signOutAction } from '@/app/[locale]/(app)/actions';
import { LocaleSwitcher } from '@/components/locale-switcher';
import { ThemeToggle } from '@/components/theme-toggle';
import { Link } from '@/i18n/navigation';

export async function Header() {
  const tApp = await getTranslations('app');
  const tTheme = await getTranslations('theme');
  const tNav = await getTranslations('nav');

  return (
    <header className="sticky top-0 z-20 border-b border-border bg-background/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4">
        <Link href="/today" className="flex items-baseline gap-0.5 font-display text-lg font-black tracking-tight uppercase">
          {tApp('name')}
          <span aria-hidden className="inline-block size-2 rounded-full bg-brand" />
        </Link>
        <div className="flex items-center gap-2">
          <LocaleSwitcher onChangeAction={setLocaleAction} />
          <ThemeToggle
            labels={{ light: tTheme('light'), dark: tTheme('dark'), system: tTheme('system') }}
          />
          <form action={signOutAction}>
            <button
              type="submit"
              aria-label={tNav('signOut')}
              title={tNav('signOut')}
              data-testid="sign-out"
              className="brutal brutal-press grid size-10 place-items-center"
            >
              <LogOut className="size-5" aria-hidden />
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
