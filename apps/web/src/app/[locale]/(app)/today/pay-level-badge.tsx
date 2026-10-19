import { BadgeDollarSign } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { StatusBadge, type StatusTone } from '@/components/ui/status-badge';

const TONE: Record<1 | 2 | 3 | 4, StatusTone> = { 1: 'neutral', 2: 'move', 3: 'offer', 4: 'offer' };

/** Djinni's relative pay level for a job without a published salary. */
export function PayLevelBadge({ level }: { level: 1 | 2 | 3 | 4 }) {
  const t = useTranslations('feed');
  return (
    <StatusBadge tone={TONE[level]} icon={BadgeDollarSign} data-testid="pay-level" data-level={level} title={t('payLevelHint')}>
      {t(`payLevel_${level}`)}
    </StatusBadge>
  );
}
