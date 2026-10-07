import { getTranslations } from 'next-intl/server';
import { NAV_ITEMS } from './nav-items';
import { NavLink } from './nav-link';

export async function Sidebar() {
  const t = await getTranslations('nav');
  return (
    <nav aria-label="Main" className="hidden w-56 shrink-0 flex-col gap-1 md:flex">
      {NAV_ITEMS.map((item) => (
        <NavLink
          key={item.key}
          navKey={item.key}
          label={t(item.key)}
          badge={item.soon ? t('soon') : undefined}
        />
      ))}
    </nav>
  );
}
