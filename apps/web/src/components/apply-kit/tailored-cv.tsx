'use client';

import type { TailoredCv } from '@jp/ai';
import { Download, FileText, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { pill } from '@/components/ui/pill';
import { Link } from '@/i18n/navigation';
import { generateTailoredCv, getTailoredCv, type KitError, saveTailoredCv } from './actions';
import type { AtsScore } from './ats';
import { CvPaper } from './cv-paper';

/**
 * "CV for this job": the user's CV rewritten for the posting, with every change visible — amber where it was
 * strengthened, red where it says something the CV does not — each removable before the PDF is downloaded.
 */
export function TailoredCvSection({ jobId, lang, contacts }: { jobId: string; lang: 'auto' | 'en' | 'uk' | 'ru'; contacts: string[] }) {
  const t = useTranslations('tailoredCv');
  const [cv, setCv] = useState<TailoredCv | null>(null);
  const [ats, setAts] = useState<AtsScore | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<KitError | null>(null);

  useEffect(() => {
    let alive = true;
    void getTailoredCv(jobId).then((c) => {
      if (!alive || !c) return;
      setCv(c.cv);
      setAts(c.ats);
    });
    return () => {
      alive = false;
    };
  }, [jobId]);

  const run = async () => {
    setLoading(true);
    setError(null);
    const res = await generateTailoredCv(jobId, lang).catch(() => ({ ok: false as const, error: 'failed' as const }));
    setLoading(false);
    if (res.ok) {
      setCv(res.cv);
      setAts(res.ats);
    } else setError(res.error);
  };

  const drop = (what: { skill: string } | { role: number; bullet: number }) => {
    if (!cv) return;
    const next: TailoredCv =
      'skill' in what
        ? { ...cv, skills: cv.skills.filter((s) => s.name !== what.skill) }
        : { ...cv, experience: cv.experience.map((r, i) => (i === what.role ? { ...r, bullets: r.bullets.filter((_, j) => j !== what.bullet) } : r)) };
    setCv(next);
    void saveTailoredCv(jobId, next)
      .then((r) => r.ats && setAts(r.ats))
      .catch(() => undefined);
  };

  const unverified = cv ? cv.skills.filter((s) => !s.inProfile).length + cv.experience.flatMap((r) => r.bullets).filter((b) => b.change === 'unverified').length : 0;
  const labels = { experience: t('experience'), skills: t('skills'), languages: t('languages'), summary: t('summary'), present: t('present') };

  return (
    <section data-testid="tailored-cv" className="flex flex-col gap-3 rounded-xl border border-border bg-card/50 p-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <FileText aria-hidden className="size-4 text-brand" />
          {t('title')}
        </h3>
        <span className="flex flex-wrap gap-2">
          <button type="button" data-testid="tailored-cv-generate" disabled={loading} onClick={() => void run()} className={cv ? pill.quiet : pill.primary}>
            {loading ? t('writing') : cv ? t('again') : t('generate')}
          </button>
          {cv && (
            <Link href={`/cv/${jobId}`} target="_blank" data-testid="tailored-cv-pdf" className={pill.primary}>
              <Download aria-hidden className="size-4" />
              {t('download')}
            </Link>
          )}
        </span>
      </div>
      {!cv && !loading && <p className="text-sm text-muted-foreground">{t('intro')}</p>}
      {error && <p role="alert" className="text-sm text-danger">{t(`error_${error}`)}</p>}
      {cv && (
        <>
          {ats && <AtsBar ats={ats} />}
          <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5"><span aria-hidden className="size-3 rounded bg-[#fdf0c8]" />{t('legendBoosted')}</span>
            <span className="flex items-center gap-1.5"><span aria-hidden className="size-3 rounded bg-[#fde2e2]" />{t('legendUnverified')}</span>
            {unverified > 0 && <span data-testid="tailored-cv-check" className="font-semibold text-danger">{t('check', { count: unverified })}</span>}
          </p>
          <div className="overflow-hidden rounded-lg border border-border shadow-[var(--shadow)]">
            <CvPaper
              cv={cv}
              contacts={contacts}
              labels={labels}
              marks
              remove={(what) => (
                <button
                  type="button"
                  data-testid="tailored-cv-remove"
                  onClick={() => drop(what)}
                  aria-label={t('remove')}
                  title={t('remove')}
                  className="ml-1 inline-grid size-4 translate-y-0.5 place-items-center rounded-full bg-[#ececf0] text-[#4b4b55] hover:bg-[#d93636] hover:text-white"
                >
                  <X aria-hidden className="size-3" />
                </button>
              )}
            />
          </div>
        </>
      )}
    </section>
  );
}

/** "ATS keywords: 9 of 14 in your CV → 13 of 14 in this one", with the ones still missing. */
function AtsBar({ ats }: { ats: AtsScore }) {
  const t = useTranslations('tailoredCv');
  const pct = (n: number) => Math.round((n / ats.total) * 100);
  return (
    <div data-testid="tailored-cv-ats" className="flex flex-col gap-2 rounded-lg bg-muted px-3 py-2.5 text-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-semibold">{t('atsTitle')}</span>
        <span className="tabular-nums text-muted-foreground">
          {t('atsBefore', { n: ats.before, total: ats.total })} → <b data-testid="tailored-cv-ats-after" className="text-foreground">{t('atsAfter', { n: ats.after, total: ats.total, pct: pct(ats.after) })}</b>
        </span>
      </div>
      <div aria-hidden className="relative h-2 overflow-hidden rounded-full bg-background">
        <span className="absolute inset-y-0 left-0 rounded-full bg-status-neutral/50" style={{ width: `${pct(ats.before)}%` }} />
        <span className="absolute inset-y-0 left-0 rounded-full bg-brand transition-[width]" style={{ width: `${pct(ats.after)}%`, opacity: 0.85 }} />
      </div>
      {ats.missing.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {t('atsMissing')} <span className="font-medium text-foreground">{ats.missing.slice(0, 8).join(', ')}</span>
        </p>
      )}
    </div>
  );
}
