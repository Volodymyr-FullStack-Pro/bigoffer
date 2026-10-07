'use client';

import { motion, useMotionValue, useReducedMotion, useTransform } from 'motion/react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { ScoreMeter } from '@/components/ui/score-meter';
import type { FeedMatch } from './feed-types';
import { MatchActions, MatchDetail, type MatchAction } from './match-detail';

const THRESHOLD = 120;

/** Top card of the mobile deck: drag right → save, left → hide. Every swipe has a button twin. */
export function SwipeCard({ match, onAction, onApplied }: { match: FeedMatch; onAction: (a: MatchAction) => void; onApplied?: () => void }) {
  const t = useTranslations('today');
  const tf = useTranslations('feed');
  const reduce = useReducedMotion();
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-200, 200], reduce ? [0, 0] : [-12, 12]);
  const saveOpacity = useTransform(x, [0, 40, 120], [0, 0, 1]);
  const hideOpacity = useTransform(x, [-120, -40, 0], [1, 0, 0]);
  const [open, setOpen] = useState(false);

  return (
    <div className="flex flex-col gap-4">
      <motion.article
        data-testid="job-match"
        data-match-id={match.id}
        className="brutal relative flex touch-pan-y flex-col gap-3 p-4"
        style={{ x, rotate }}
        drag={reduce ? false : 'x'}
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.9}
        onDragEnd={(_, info) => {
          if (info.offset.x > THRESHOLD) onAction('saved');
          else if (info.offset.x < -THRESHOLD) onAction('hide');
        }}
      >
        <motion.span aria-hidden style={{ opacity: saveOpacity }} className="absolute right-4 top-4 rotate-12 border-2 border-border bg-brand px-2 font-display font-black uppercase text-brand-foreground">
          {tf('save')}
        </motion.span>
        <motion.span aria-hidden style={{ opacity: hideOpacity }} className="absolute left-4 top-4 -rotate-12 border-2 border-border bg-card px-2 font-display font-black uppercase">
          {tf('hide')}
        </motion.span>
        <ScoreMeter score={match.score} label={t('match')} />
        <h2 className="font-display text-xl font-black leading-tight">{match.title}</h2>
        <p className="text-muted-foreground">{match.company}</p>
        {match.summary && <p data-testid="match-summary" className="line-clamp-2 text-sm">{match.summary}</p>}
        <button type="button" className="self-start font-mono text-xs uppercase underline" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
          {open ? tf('lessDetails') : tf('moreDetails')}
        </button>
      </motion.article>
      {open && <MatchDetail match={match} onApplied={onApplied} />}
      <MatchActions onAction={onAction} compact />
    </div>
  );
}
