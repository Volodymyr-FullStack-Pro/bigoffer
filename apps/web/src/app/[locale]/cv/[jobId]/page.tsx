import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { getTailoredCv } from '@/components/apply-kit/actions';
import { CvPaper } from '@/components/apply-kit/cv-paper';
import { requireUserId } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { PrintBar } from './print-bar';

const CONTACT_KEYS = ['email', 'phone', 'linkedin', 'github', 'portfolio', 'telegram'] as const;

export async function generateMetadata({ params }: { params: Promise<{ jobId: string }> }): Promise<Metadata> {
  const { jobId } = await params;
  const cv = (await getTailoredCv(jobId))?.cv;
  // The browser names the saved PDF after the title.
  return { title: cv?.fullName ? `${cv.fullName} — CV` : 'CV', robots: { index: false } };
}

/** The CV for one job as a clean page: "Save as PDF" keeps real text, so applicant tracking systems read it. */
export default async function TailoredCvPage({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  const userId = await requireUserId();
  const cv = (await getTailoredCv(jobId))?.cv;
  if (!cv) notFound();
  const t = await getTranslations();
  const supabase = await createClient();
  const { data: profile } = await supabase.from('profiles').select('contacts').eq('id', userId).single();
  const raw = (profile?.contacts ?? {}) as Record<string, unknown>;
  const contacts = CONTACT_KEYS.map((k) => raw[k]).filter((v): v is string => typeof v === 'string' && v.trim() !== '');
  return (
    <div className="min-h-dvh bg-[#ececf0] py-8 print:bg-white print:py-0">
      <PrintBar label={t('tailoredCv.savePdf')} hint={t('tailoredCv.savePdfHint')} />
      <div className="mx-auto max-w-[210mm] shadow-[0_10px_40px_-20px_rgb(0_0_0/0.4)] print:max-w-none print:shadow-none">
        <CvPaper cv={cv} contacts={contacts} labels={{ experience: t('tailoredCv.experience'), skills: t('tailoredCv.skills'), languages: t('tailoredCv.languages'), summary: t('tailoredCv.summary'), present: t('tailoredCv.present') }} />
      </div>
    </div>
  );
}
