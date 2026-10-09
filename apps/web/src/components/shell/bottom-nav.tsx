import { getTranslations } from 'next-intl/server';
import { NAV_ITEMS } from './nav-items';
import { NavLink } from './nav-link';

export async function BottomNav() {
  const t = await getTranslations('nav');
  return (
    <nav
      aria-label="Main mobile"
      className="fixed inset-x-0 bottom-0 z-20 flex border-t border-border bg-card pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      {NAV_ITEMS.filter((item) => item.mobile).map((item) => (
        <NavLink key={item.key} navKey={item.key} label={t(item.key)} compact />
      ))}
    </nav>
  );
}
