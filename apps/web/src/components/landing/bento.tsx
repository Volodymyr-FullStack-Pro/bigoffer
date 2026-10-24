import { Coins, Puzzle, Send, Users } from 'lucide-react';
import type { ReactNode } from 'react';
import { Coin } from '@/components/brand/logo';
import { Reveal } from './motion';
import { Radar, type RadarJob, type RadarLabels } from './radar';

export type BentoText = Record<
  'radarTitle' | 'radarText' | 'extTitle' | 'extText' | 'extName' | 'extEmail' | 'extSalary' | 'payTitle' | 'payText' | 'payYou' | 'tgTitle' | 'tgText' | 'tgMsg' | 'peopleTitle' | 'peopleText',
  string
>;

function Tile({ title, text, icon, children, className = '', delay = 0 }: { title: string; text: string; icon?: ReactNode; children?: ReactNode; className?: string; delay?: number }) {
  return (
    <Reveal delay={delay} className={`group flex flex-col gap-4 overflow-hidden rounded-2xl border border-border bg-card p-6 transition-[border-color,transform] duration-300 hover:-translate-y-0.5 hover:border-brand/40 ${className}`}>
      <div>
        <h3 className="flex items-center gap-2 text-xl font-bold tracking-[-0.02em]">
          {icon}
          {title}
        </h3>
        <p className="mt-1.5 text-muted-foreground">{text}</p>
      </div>
      {children}
    </Reveal>
  );
}

/** What else BigOffer does, sized by how much it matters: the live radar takes the biggest tile. */
export function Bento({ t, jobs, radar }: { t: BentoText; jobs: RadarJob[]; radar: RadarLabels }) {
  return (
    <div className="grid gap-4 md:grid-cols-6">
      <Tile title={t.radarTitle} text={t.radarText} className="md:col-span-4 md:row-span-2">
        <Radar jobs={jobs} labels={radar} watcher={false} />
      </Tile>
      <Tile title={t.extTitle} text={t.extText} icon={<Puzzle aria-hidden className="size-5 text-brand" />} className="md:col-span-2" delay={80}>
        <div className="flex flex-col gap-2 rounded-xl bg-muted p-3 text-sm">
          {[t.extName, t.extEmail, t.extSalary].map((v, i) => (
            <span key={v} className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2">
              <span className="bento-type overflow-hidden whitespace-nowrap" style={{ animationDelay: `${i * 0.9}s` }}>
                {v}
              </span>
            </span>
          ))}
        </div>
      </Tile>
      <Tile title={t.payTitle} text={t.payText} icon={<Coins aria-hidden className="size-5 text-brand" />} className="md:col-span-2" delay={160}>
        <div className="flex flex-col gap-2">
          <div className="relative h-3 rounded-full bg-muted">
            <span className="absolute inset-y-0 left-[22%] right-[30%] rounded-full bg-brand/40" />
            <span className="absolute top-1/2 left-[56%] size-5 -translate-x-1/2 -translate-y-1/2">
              <Coin className="size-5" />
            </span>
          </div>
          <span className="flex justify-between font-mono text-xs text-muted-foreground tabular-nums">
            <span>$2.8k</span>
            <span className="font-semibold text-foreground">{t.payYou}</span>
            <span>$4k</span>
          </span>
        </div>
      </Tile>
      <Tile title={t.tgTitle} text={t.tgText} icon={<Send aria-hidden className="size-5 text-status-move" />} className="md:col-span-3" delay={80}>
        <div className="self-start rounded-xl rounded-tl-sm bg-[#182533] px-3.5 py-2.5 text-sm text-[#f5f5f7]">🔥 {t.tgMsg}</div>
      </Tile>
      <Tile title={t.peopleTitle} text={t.peopleText} icon={<Users aria-hidden className="size-5 text-status-interview" />} className="md:col-span-3" delay={160}>
        <div className="flex -space-x-2">
          {['OK', 'AY', 'MS', 'DL', '+9'].map((x, i) => (
            <span key={x} className="grid size-10 place-items-center rounded-full border-2 border-card text-xs font-bold text-[#0f1116]" style={{ background: ['var(--brand)', 'var(--status-move)', 'var(--status-wait)', 'var(--status-test)', 'var(--muted)'][i], color: i === 4 ? 'var(--foreground)' : undefined }}>
              {x}
            </span>
          ))}
        </div>
      </Tile>
    </div>
  );
}
