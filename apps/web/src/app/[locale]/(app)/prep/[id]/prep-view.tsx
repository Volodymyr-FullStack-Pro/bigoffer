'use client';

import { AlarmClock, CircleHelp, Mic, PenLine, TriangleAlert } from 'lucide-react';
import { PREP_LEVELS, type PrepLesson, type PrepLevel, type PrepPitch, type PrepPlan, type PrepTopic } from '@jp/ai';
import { useFormatter, useTranslations } from 'next-intl';
import { useState } from 'react';
import { Link, useRouter } from '@/i18n/navigation';
import { JoinMeeting } from '../../board/join-meeting';
import { deletePrep, getLesson, getPitch, setTopicDone } from '../actions';

type Card = { title: string; company: string; url: string | null; interviewAt: string | null; meetingUrl: string | null };

export function PrepView({ prepId, card, plan, lessons: initialLessons, pitch: initialPitch, done: initialDone }: {
  prepId: string;
  card: Card;
  plan: PrepPlan;
  lessons: Record<string, PrepLesson>;
  pitch: PrepPitch | null;
  done: string[];
}) {
  const t = useTranslations('prep');
  const tb = useTranslations('board');
  const format = useFormatter();
  const router = useRouter();
  const [lessons, setLessons] = useState(initialLessons);
  const [done, setDone] = useState(initialDone);
  const [open, setOpen] = useState<string | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pitch, setPitch] = useState(initialPitch);
  const [pitchBusy, setPitchBusy] = useState(false);
  const [pitchError, setPitchError] = useState<string | null>(null);
  const learned = plan.topics.filter((x) => done.includes(x.key)).length;

  // The level shown for each opened topic; a topic opens on Junior.
  const [levels, setLevels] = useState<Record<string, PrepLevel>>({});
  const slotOf = (key: string, level: PrepLevel) => (level === 'junior' ? key : `${key}@${level}`);

  const load = async (topic: PrepTopic, level: PrepLevel) => {
    const slot = slotOf(topic.key, level);
    if (lessons[slot]) return;
    setLoading(slot);
    setErrors((all) => Object.fromEntries(Object.entries(all).filter(([k]) => k !== slot)));
    try {
      const res = await getLesson(prepId, topic.key, level);
      if (res.ok) setLessons((all) => ({ ...all, [slot]: res.lesson }));
      else setErrors((all) => ({ ...all, [slot]: res.error }));
    } catch {
      setErrors((all) => ({ ...all, [slot]: 'failed' }));
    } finally {
      setLoading(null);
    }
  };

  const openTopic = async (topic: PrepTopic) => {
    if (open === topic.key) return setOpen(null);
    setOpen(topic.key);
    await load(topic, levels[topic.key] ?? 'junior');
  };

  const pickLevel = (topic: PrepTopic, level: PrepLevel) => {
    setLevels((all) => ({ ...all, [topic.key]: level }));
    void load(topic, level);
  };

  const toggleDone = async (key: string) => {
    const next = await setTopicDone(prepId, key, !done.includes(key)).catch(() => null);
    if (next) setDone(next);
  };

  const writePitch = async (again: boolean) => {
    setPitchBusy(true);
    setPitchError(null);
    try {
      const res = await getPitch(prepId, again);
      if (res.ok) setPitch(res.pitch);
      else setPitchError(res.error);
    } catch {
      setPitchError('failed');
    } finally {
      setPitchBusy(false);
    }
  };

  return (
    <section className="flex flex-col gap-6">
      <Link href="/prep" className="tabular-nums text-sm underline">← {t('back')}</Link>

      <header className="brutal flex flex-col gap-3 p-5">
        <span className="tabular-nums text-xs text-muted-foreground">{t('preparingFor')}</span>
        <h1 className="font-display text-2xl leading-tight font-extrabold [overflow-wrap:anywhere] md:text-3xl">{card.title}</h1>
        <p className="text-muted-foreground">
          {card.company}
          {plan.role && <> · <span data-testid="prep-role">{plan.role}</span></>}
        </p>
        <div className="flex flex-wrap items-center gap-3">
          {card.interviewAt && (
            <span suppressHydrationWarning className="tabular-nums text-sm font-semibold">
              <AlarmClock aria-hidden className="mr-1 inline size-4 -translate-y-px" />
              {format.dateTime(new Date(card.interviewAt), { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          {card.meetingUrl && <JoinMeeting url={card.meetingUrl} label={tb('joinMeeting')} testId="prep-join" />}
          {card.url && <a href={card.url} target="_blank" rel="noopener noreferrer" className="tabular-nums text-sm underline">{tb('openOriginal')} ↗</a>}
        </div>
        {plan.summary && <p data-testid="prep-summary" className="leading-relaxed">{plan.summary}</p>}
        {plan.expectations.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <h2 className="font-semibold">{t('expectations')}</h2>
            <ul className="flex list-disc flex-col gap-1 pl-5">
              {plan.expectations.map((e) => <li key={e}>{e}</li>)}
            </ul>
          </div>
        )}
      </header>

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-display text-xl font-semibold">{t('topics')}</h2>
          <span data-testid="prep-progress" className="tabular-nums text-sm">{t('progress', { done: learned, total: plan.topics.length })}</span>
        </div>
        <p className="text-sm text-muted-foreground">{t('topicsHint')}</p>
        <ol className="flex flex-col gap-2">
          {plan.topics.map((topic, i) => {
            const isOpen = open === topic.key;
            const level = levels[topic.key] ?? 'junior';
            const slot = slotOf(topic.key, level);
            const lesson = lessons[slot];
            const basics = lessons[topic.key];
            const learnedTopic = done.includes(topic.key);
            return (
              <li key={topic.key} data-testid="prep-topic" data-key={topic.key} className={`brutal flex flex-col ${learnedTopic ? 'opacity-80' : ''}`}>
                <button type="button" data-testid="prep-topic-open" aria-expanded={isOpen} onClick={() => void openTopic(topic)} className="flex items-start gap-3 p-4 text-left">
                  <span className={`mt-0.5 grid size-6 shrink-0 place-items-center rounded-full border border-border tabular-nums text-xs ${learnedTopic ? 'bg-brand text-brand-foreground' : ''}`}>
                    {learnedTopic ? '✓' : i + 1}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="font-semibold [overflow-wrap:anywhere]">
                      {topic.title}
                      {!topic.fromJob && <span className="ml-2 rounded-full bg-ai/20 px-2 py-0.5 align-middle text-[11px] font-medium">{t('likelyAsked')}</span>}
                    </span>
                    <span className="text-sm text-muted-foreground">{topic.why}</span>
                  </span>
                  <span aria-hidden className="tabular-nums text-sm">{isOpen ? '−' : '+'}</span>
                </button>
                {isOpen && (
                  <div className="flex flex-col gap-4 border-t border-border p-4">
                    <div role="tablist" aria-label={t('level')} className="flex flex-wrap gap-2">
                      {PREP_LEVELS.map((l) => (
                        <button
                          key={l}
                          type="button"
                          role="tab"
                          data-testid="prep-level"
                          data-level={l}
                          aria-selected={level === l}
                          onClick={() => pickLevel(topic, l)}
                          className={`rounded-full border-[1.5px] border-border px-3 py-1 text-sm font-semibold ${level === l ? LEVEL_STYLE[l] : ''}`}
                        >
                          {lessons[slotOf(topic.key, l)] ? '✓ ' : ''}
                          {t(`level_${l}`)}
                        </button>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground">{t(`levelHint_${level}`)}</p>
                    {loading === slot && <LessonSkeleton label={t(level === 'junior' ? 'writingLesson' : 'writingLevel', { level: t(`level_${level}`) })} />}
                    {errors[slot] && <p role="alert" className="text-sm text-danger">{t(`err_${errors[slot]}` as never)}</p>}
                    {lesson && <Lesson lesson={lesson} level={level} />}
                    {basics && (
                      <button
                        type="button"
                        data-testid="prep-topic-done"
                        onClick={() => void toggleDone(topic.key)}
                        className={`brutal brutal-press self-start px-3 py-1.5 text-sm font-semibold ${learnedTopic ? '' : 'bg-brand text-brand-foreground'}`}
                      >
                        {learnedTopic ? t('notLearned') : `✓ ${t('learned')}`}
                      </button>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      </div>

      <div data-testid="prep-pitch" className="brutal flex flex-col gap-3 p-5">
        <h2 className="flex items-center gap-2 font-display text-xl font-semibold"><Mic aria-hidden className="size-5" /> {t('pitchTitle')}</h2>
        <p className="text-sm text-muted-foreground">{t('pitchHint')}</p>
        {pitch ? (
          <>
            <div className="flex flex-col gap-1">
              <h3 className="font-semibold">{t('pitchIntro')}</h3>
              <p data-testid="prep-pitch-intro" className="leading-relaxed whitespace-pre-line">{pitch.intro}</p>
            </div>
            <ul className="flex flex-col gap-3">
              {pitch.points.map((p) => (
                <li key={p.requirement} className="flex flex-col gap-1 border-l-4 border-brand pl-3">
                  <span className="font-semibold">{p.requirement}</span>
                  <span className="leading-relaxed">{p.answer}</span>
                </li>
              ))}
            </ul>
            <button type="button" disabled={pitchBusy} onClick={() => void writePitch(true)} className="brutal brutal-press self-start px-3 py-1.5 text-sm disabled:opacity-50">
              {pitchBusy ? t('writing') : t('pitchAgain')}
            </button>
          </>
        ) : (
          <button type="button" data-testid="prep-pitch-write" disabled={pitchBusy} onClick={() => void writePitch(false)} className="brutal brutal-press self-start bg-ai px-4 py-2 font-semibold text-ai-foreground disabled:opacity-50">
            {pitchBusy ? t('writing') : t('pitchWrite')}
          </button>
        )}
        {pitchError && <p role="alert" className="text-sm text-danger">{t(`err_${pitchError}` as never)}</p>}
      </div>

      <button
        type="button"
        onClick={async () => {
          if (!window.confirm(t('deleteConfirm'))) return;
          if (await deletePrep(prepId).catch(() => false)) router.push('/prep');
        }}
        className="self-start text-sm text-danger underline"
      >
        {t('delete')}
      </button>
    </section>
  );
}

const LEVEL_STYLE: Record<PrepLevel, string> = {
  junior: 'bg-brand text-brand-foreground',
  middle: 'bg-status-move text-white dark:text-[#0c1a24]',
  senior: 'bg-ai text-ai-foreground',
};

function LessonSkeleton({ label }: { label: string }) {
  return (
    <div data-testid="prep-lesson-loading" className="flex flex-col gap-2" aria-busy>
      <span className="flex items-center gap-1.5 text-sm text-muted-foreground"><PenLine aria-hidden className="size-3.5" /> {label}</span>
      {[90, 75, 82, 60].map((w) => <span key={w} className="h-3 animate-pulse rounded bg-muted" style={{ width: `${w}%` }} />)}
    </div>
  );
}

function Lesson({ lesson, level }: { lesson: PrepLesson; level: PrepLevel }) {
  const t = useTranslations('prep');
  return (
    <div data-testid="prep-lesson" data-level={level} className="flex flex-col gap-4">
      <p className="leading-relaxed">{lesson.intro}</p>
      {lesson.concepts.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className="font-semibold">{t('concepts')}</h3>
          <dl className="flex flex-col gap-2">
            {lesson.concepts.map((c) => (
              <div key={c.name}>
                <dt className="font-mono text-sm font-semibold">{c.name}</dt>
                <dd className="text-sm leading-relaxed">{c.explain}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}
      {lesson.examples.length > 0 && (
        <section className="flex flex-col gap-3">
          <h3 className="font-semibold">{t('examples')}</h3>
          {lesson.examples.map((e) => (
            <div key={e.title} className="flex flex-col gap-1.5">
              <span className="text-sm font-semibold">{e.title}</span>
              <span className="text-sm leading-relaxed">{e.explain}</span>
              {e.code && (
                <pre data-testid="prep-code" className="overflow-x-auto rounded-lg border border-border bg-muted p-3 font-mono text-xs leading-relaxed">
                  {e.codeLang && <span className="mb-1 block text-[10px] text-muted-foreground uppercase">{e.codeLang}</span>}
                  <code>{e.code}</code>
                </pre>
              )}
            </div>
          ))}
        </section>
      )}
      {lesson.pitfalls.length > 0 && (
        <section className="flex flex-col gap-1.5">
          <h3 className="flex items-center gap-1.5 font-semibold"><TriangleAlert aria-hidden className="size-4 text-status-wait" /> {t('pitfalls')}</h3>
          <ul className="flex list-disc flex-col gap-1 pl-5 text-sm">
            {lesson.pitfalls.map((p) => <li key={p}>{p}</li>)}
          </ul>
        </section>
      )}
      {lesson.questions.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className="flex items-center gap-1.5 font-semibold"><CircleHelp aria-hidden className="size-4 text-status-move" /> {t('questions')}</h3>
          {lesson.questions.map((q) => (
            <details key={q.q} className="rounded-lg border border-border p-3">
              <summary className="cursor-pointer text-sm font-semibold">{q.q}</summary>
              <p className="mt-2 text-sm leading-relaxed">{q.a}</p>
            </details>
          ))}
        </section>
      )}
    </div>
  );
}
