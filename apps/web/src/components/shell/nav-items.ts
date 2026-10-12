import { BarChart3, Columns3, Flame, GraduationCap, SlidersHorizontal, User, type LucideIcon } from 'lucide-react';

export type NavKey = 'today' | 'board' | 'search' | 'analytics' | 'prep' | 'profile';

export const NAV_ITEMS: {
  key: NavKey;
  href: string;
  icon: LucideIcon;
  soon?: boolean;
  mobile: boolean;
}[] = [
  { key: 'today', href: '/today', icon: Flame, mobile: true },
  { key: 'board', href: '/board', icon: Columns3, mobile: true },
  { key: 'search', href: '/search', icon: SlidersHorizontal, mobile: true },
  { key: 'analytics', href: '/analytics', icon: BarChart3, mobile: true },
  { key: 'prep', href: '/prep', icon: GraduationCap, soon: true, mobile: false },
  { key: 'profile', href: '/profile', icon: User, mobile: true },
];
