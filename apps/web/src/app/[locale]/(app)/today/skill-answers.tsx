'use client';

import { CircleHelp, Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { createContext, type ReactNode, useContext, useState } from 'react';
import { useSaveUiPrefs } from '@/lib/use-save-ui-prefs';
import { skillKey } from './card-skills';
import { addSkill } from './hide-tips-actions';

type Answers = {
  /** Whether the user already answered about this skill (added it or said no). */
  answered: (skill: string) => boolean;
  /** Adds the skill to the search; resolves false when saving failed. */
  yes: (skill: string) => Promise<boolean>;
  no: (skill: string) => void;
};

const SkillAnswersContext = createContext<Answers | null>(null);

/** One answer per skill for the whole page: answering in the banner also settles the question on each job. */
export function SkillAnswers({ declined, children }: { declined: string[]; children: ReactNode }) {
  const save = useSaveUiPrefs(0);
  const [no, setNo] = useState<string[]>(declined);
  const [added, setAdded] = useState<string[]>([]);
  const value: Answers = {
    answered: (skill) => [...no, ...added].some((s) => skillKey(s) === skillKey(skill)),
    yes: async (skill) => {
      const ok = await addSkill(skill).catch(() => false);
      if (ok) setAdded((a) => [...a, skill]);
      return ok;
    },
    no: (skill) => {
      const next = [...new Set([...no, skill])].slice(-200);
      setNo(next);
      save({ skillsDeclined: next });
    },
  };
  return <SkillAnswersContext.Provider value={value}>{children}</SkillAnswersContext.Provider>;
}

function useAnswer(skill: string) {
  const answers = useContext(SkillAnswersContext);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  return {
    hidden: !answers || (!done && answers.answered(skill)),
    done,
    busy,
    yes: async () => {
      if (!answers) return;
      setBusy(true);
      const ok = await answers.yes(skill);
      setBusy(false);
      if (ok) setDone(true);
    },
    no: () => answers?.no(skill),
  };
}

/** "CI/CD is in 26 jobs, and your profile lacks it": one answer sharpens every score. */
export function SkillTipBanner({ skill, count }: { skill: string; count: number }) {
  const t = useTranslations('feed');
  const a = useAnswer(skill);
  if (a.done) return <p role="status" data-testid="skill-tip-done" className="text-sm text-success">✓ {t('skillAdded', { skill })}</p>;
  if (a.hidden) return null;
  return (
    <aside data-testid="skill-tip" className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border border-brand/40 bg-brand/10 px-4 py-3 text-sm">
      <Plus aria-hidden className="size-4 shrink-0 text-brand" />
      <span className="min-w-0 flex-1">
        <span className="font-semibold">{t('skillTip', { skill, count })}</span> {t('skillTipHint')}
      </span>
      <button type="button" data-testid="skill-tip-yes" disabled={a.busy} onClick={() => void a.yes()} className="brutal-press rounded-full bg-foreground px-3 py-1 text-xs font-semibold text-background disabled:opacity-50">
        {t('skillTipYes', { skill })}
      </button>
      <button type="button" data-testid="skill-tip-no" onClick={a.no} className="rounded-full px-3 py-1 text-xs font-semibold text-muted-foreground hover:bg-muted hover:text-foreground">
        {t('skillTipNo')}
      </button>
    </aside>
  );
}

/** Under a job's technologies: "Do you have experience with X?" for the first one the profile lacks. */
export function SkillQuestion({ skills }: { skills: string[] }) {
  const answers = useContext(SkillAnswersContext);
  const skill = skills.find((s) => !answers?.answered(s));
  return skill ? <Question key={skill} skill={skill} /> : null;
}

function Question({ skill }: { skill: string }) {
  const t = useTranslations('feed');
  const a = useAnswer(skill);
  if (a.done) return <p role="status" data-testid="skill-ask-done" className="text-sm text-success">✓ {t('skillAdded', { skill })}</p>;
  if (a.hidden) return null;
  return (
    <div data-testid="skill-ask" className="flex flex-wrap items-center gap-2 rounded-xl bg-muted px-3.5 py-2.5 text-sm">
      <CircleHelp aria-hidden className="size-4 shrink-0 text-muted-foreground" />
      <span className="mr-auto">{t.rich('skillAsk', { skill, b: (c) => <b>{c}</b> })}</span>
      <button type="button" data-testid="skill-ask-yes" disabled={a.busy} onClick={() => void a.yes()} className="brutal-press rounded-full border border-border bg-card px-3 py-1 text-xs font-semibold hover:bg-background disabled:opacity-50">
        {t('skillAskYes')}
      </button>
      <button type="button" data-testid="skill-ask-no" onClick={a.no} className="rounded-full px-3 py-1 text-xs font-semibold text-muted-foreground hover:bg-background hover:text-foreground">
        {t('skillAskNo')}
      </button>
    </div>
  );
}
