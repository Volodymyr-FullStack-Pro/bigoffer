'use client';

import { AlarmClock, Bot, CalendarClock, CircleHelp, FileText, MessageCircleQuestion, Send, TrendingUp } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { ScoreMeter } from '@/components/ui/score-meter';
import { StatusBadge } from '@/components/ui/status-badge';
import { TechChip } from '@/components/ui/tech-chip';

export type ShowcaseText = Record<string, string>;
const TABS = ['feed', 'cv', 'board', 'telegram', 'chat'] as const;
type Tab = (typeof TABS)[number];

function Frame({ children }: { children: ReactNode }) {
  return <div className="brutal flex min-h-[22rem] flex-col justify-center gap-3 p-5">{children}</div>;
}

function Feed({ t }: { t: ShowcaseText }) {
  return (
    <Frame>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-display text-lg font-bold">Middle Full-Stack Developer</p>
          <p className="text-sm text-muted-foreground">Product company · Remote · $3,500–4,500</p>
        </div>
        <ScoreMeter score={93} label={t.match ?? ""} />
      </div>
      <span className="inline-flex items-center gap-1 self-start rounded-full bg-brand/15 px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ring-brand/40">
        <TrendingUp aria-hidden className="size-3 text-success" /> {t.hiring}
      </span>
      <span className="flex flex-wrap items-center gap-1">
        {['React', 'TypeScript', 'Node.js', 'PostgreSQL'].map((s) => <TechChip key={s} name={s} check />)}
        <span className="rounded-full border border-dashed border-border px-2 py-0.5 text-xs text-muted-foreground">? GraphQL</span>
        <span className="text-xs text-muted-foreground tabular-nums">{t.met}</span>
      </span>
      <p className="rounded-xl bg-muted px-3.5 py-2.5 text-sm">{t.why}</p>
      <p className="text-sm text-muted-foreground">
        {t.market} <span className="ml-1 rounded-full bg-success/15 px-2 py-0.5 text-xs font-semibold text-success">{t.above}</span>
      </p>
    </Frame>
  );
}

function Cv({ t }: { t: ShowcaseText }) {
  return (
    <Frame>
      <div className="flex flex-col gap-2 rounded-lg bg-muted px-3 py-2.5 text-sm">
        <span className="flex justify-between gap-2">
          <b>{t.ats}</b>
          <span className="tabular-nums text-muted-foreground">6 → <b className="text-foreground">11</b> / 12</span>
        </span>
        <span className="relative h-2 overflow-hidden rounded-full bg-background">
          <span className="absolute inset-y-0 left-0 w-1/2 rounded-full bg-status-neutral/50" />
          <span className="absolute inset-y-0 left-0 w-[92%] rounded-full bg-brand" />
        </span>
      </div>
      <div className="rounded-lg bg-white px-5 py-4 text-[13px] leading-relaxed text-[#16161a]">
        <p className="text-lg font-bold">Olena Koval</p>
        <p className="mb-2 inline-block rounded bg-[#fdf0c8] px-1 font-semibold">Middle Full-Stack Engineer</p>
        <ul className="list-disc pl-5">
          <li><span className="rounded bg-[#fdf0c8] px-0.5">{t.cv1}</span></li>
          <li>{t.cv2}</li>
          <li><span className="rounded bg-[#fde2e2] px-0.5 underline decoration-[#d93636] decoration-wavy">{t.cv3}</span></li>
        </ul>
      </div>
      <p className="flex flex-wrap gap-x-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5"><span className="size-3 rounded bg-[#fdf0c8]" />{t.boosted}</span>
        <span className="flex items-center gap-1.5"><span className="size-3 rounded bg-[#fde2e2]" />{t.unverified}</span>
        <span className="flex items-center gap-1.5"><FileText aria-hidden className="size-3" />PDF</span>
      </p>
    </Frame>
  );
}

function Board({ t }: { t: ShowcaseText }) {
  const card = (title: string, sub: string, badge: ReactNode, tone: string, note?: string) => (
    <div className="flex flex-col gap-1">
      <div className="brutal flex flex-col gap-1.5 p-3" style={{ borderLeftColor: `var(--status-${tone})`, borderLeftWidth: 3 }}>
        {badge}
        <span className="font-semibold leading-tight">{title}</span>
        <span className="text-sm text-muted-foreground">{sub}</span>
      </div>
      {note && <span className="pl-1 text-xs text-link">↑ {note}</span>}
    </div>
  );
  return (
    <Frame>
      <div className="grid gap-3 sm:grid-cols-2">
        {card('Web Developer', 'Djinni', <StatusBadge tone="move" icon={CircleHelp}>{t.question}</StatusBadge>, 'move', t.noteArrow)}
        {card('Senior Full-Stack Engineer', 'DOU', <StatusBadge tone="interview" icon={CalendarClock}>{t.interview}</StatusBadge>, 'interview')}
        {card('Junior Frontend Engineer', 'robota.ua · 100%', <StatusBadge tone="wait" icon={AlarmClock}>{t.ping}</StatusBadge>, 'wait', t.noteScore)}
        {card('Full-stack Engineer', 'Djinni', <StatusBadge tone="neutral" icon={Bot}>{t.auto}</StatusBadge>, 'neutral', t.noteAuto)}
      </div>
    </Frame>
  );
}

function Telegram({ t }: { t: ShowcaseText }) {
  return (
    <Frame>
      <div className="mx-auto flex w-full max-w-sm flex-col gap-2 rounded-2xl bg-[#17212b] p-3 text-[#f5f5f7]">
        <span className="text-xs text-[#6d7f8f]">BigOffer · {t.now}</span>
        <div className="rounded-xl rounded-tl-sm bg-[#182533] px-3 py-2.5 text-sm">
          <p className="font-semibold">🔥 {t.tgTitle}</p>
          <p className="mt-1">Middle Full-Stack Developer · 93%</p>
          <p className="text-[#8ea2b4]">Product company · Remote · $3,500–4,500</p>
          <p className="mt-1 text-[#8ea2b4]">{t.tgWhy}</p>
        </div>
        <div className="grid grid-cols-2 gap-1.5 text-center text-sm font-semibold">
          <span className="rounded-lg bg-[#2b5278] py-2">{t.tgOpen}</span>
          <span className="rounded-lg bg-[#2b5278] py-2">{t.tgKit}</span>
          <span className="rounded-lg bg-[#2b5278] py-2">{t.tgSave}</span>
          <span className="rounded-lg bg-[#2b5278] py-2">{t.tgHide}</span>
        </div>
      </div>
    </Frame>
  );
}

function Chat({ t }: { t: ShowcaseText }) {
  return (
    <Frame>
      <span className="flex items-center gap-2 text-sm font-semibold"><MessageCircleQuestion aria-hidden className="size-4 text-brand" />{t.chatTitle}</span>
      <p className="max-w-[85%] self-end rounded-xl bg-brand/15 px-3 py-2 text-sm">{t.chatQ}</p>
      <p className="max-w-[90%] self-start rounded-xl bg-muted px-3 py-2 text-sm whitespace-pre-line">{t.chatA}</p>
      <span className="mt-auto flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm text-muted-foreground">
        {t.chatPlaceholder} <Send aria-hidden className="ml-auto size-4 text-brand" />
      </span>
    </Frame>
  );
}

/** What the app looks like, one screen at a time, drawn with the app's own pieces. */
export function Showcase({ t }: { t: ShowcaseText }) {
  const [tab, setTab] = useState<Tab>('feed');
  return (
    <div className="grid gap-6 md:grid-cols-[minmax(0,15rem)_minmax(0,1fr)] md:gap-10">
      <div role="tablist" aria-orientation="vertical" className="flex gap-2 overflow-x-auto md:flex-col md:overflow-visible">
        {TABS.map((k) => (
          <button
            key={k}
            role="tab"
            type="button"
            aria-selected={tab === k}
            data-testid={`showcase-${k}`}
            onClick={() => setTab(k)}
            className={`shrink-0 rounded-xl px-4 py-3 text-left transition-colors md:w-full ${tab === k ? 'bg-brand text-brand-foreground' : 'hover:bg-muted'}`}
          >
            <span className="block font-semibold">{t[`tab_${k}`]}</span>
            <span className={`hidden text-sm md:block ${tab === k ? 'text-brand-foreground/75' : 'text-muted-foreground'}`}>{t[`tab_${k}_hint`]}</span>
          </button>
        ))}
      </div>
      <div role="tabpanel">
        {tab === 'feed' && <Feed t={t} />}
        {tab === 'cv' && <Cv t={t} />}
        {tab === 'board' && <Board t={t} />}
        {tab === 'telegram' && <Telegram t={t} />}
        {tab === 'chat' && <Chat t={t} />}
      </div>
    </div>
  );
}
