import type { TailoredCv } from '@jp/ai';
import type { ReactNode } from 'react';

export type CvLabels = { experience: string; skills: string; languages: string; summary: string; present: string };

/**
 * The CV as a page: black on white, one column, real text (ATS read it as text). With `marks`, a reworded line is
 * tinted amber and a claim the CV does not back is underlined red, each with an optional control (`remove`) beside it.
 */
export function CvPaper({
  cv,
  contacts,
  labels,
  marks = false,
  remove,
}: {
  cv: TailoredCv;
  contacts: string[];
  labels: CvLabels;
  marks?: boolean;
  remove?: (what: { skill: string } | { role: number; bullet: number }) => ReactNode;
}) {
  const h2 = 'mt-5 mb-2 border-b border-[#d9d9de] pb-1 text-[11px] font-bold tracking-[0.08em] text-[#4b4b55] uppercase';
  return (
    <div data-testid="cv-paper" className="bg-white px-8 py-7 text-[13px] leading-relaxed text-[#16161a] [font-family:Geist,Arial,sans-serif]">
      {cv.fullName && <p className="text-2xl font-bold tracking-[-0.01em]">{cv.fullName}</p>}
      <p className={`mt-0.5 text-[15px] font-semibold ${marks ? 'rounded bg-[#fdf0c8] px-1' : ''} inline-block`}>{cv.headline}</p>
      {contacts.length > 0 && <p className="mt-1 text-[12px] text-[#4b4b55]">{contacts.join(' · ')}</p>}
      {cv.summary && (
        <>
          <h2 className={h2}>{labels.summary}</h2>
          <p>{cv.summary}</p>
        </>
      )}
      <h2 className={h2}>{labels.experience}</h2>
      <div className="flex flex-col gap-3">
        {cv.experience.map((role, r) => (
          <div key={`${role.company}-${r}`} className="break-inside-avoid">
            <p className="flex flex-wrap justify-between gap-x-4">
              <span>
                <b>{role.title}</b> · {role.company}
              </span>
              <span className="text-[12px] text-[#4b4b55]">{[role.start, role.end ?? labels.present].filter(Boolean).join(' – ')}</span>
            </p>
            <ul className="mt-1 list-disc pl-5">
              {role.bullets.map((b, i) => (
                <li key={i} data-change={b.change}>
                  <span
                    className={
                      marks && b.change === 'reworded'
                        ? 'rounded bg-[#fdf0c8] px-0.5'
                        : marks && b.change === 'unverified'
                          ? 'rounded bg-[#fde2e2] px-0.5 underline decoration-[#d93636] decoration-wavy'
                          : ''
                    }
                  >
                    {b.text}
                  </span>
                  {remove && b.change !== 'same' && remove({ role: r, bullet: i })}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <h2 className={h2}>{labels.skills}</h2>
      <p className="flex flex-wrap gap-x-1.5 gap-y-1">
        {cv.skills.map((s, i) => (
          <span key={s.name} data-in-profile={s.inProfile}>
            <span className={marks && !s.inProfile ? 'rounded bg-[#fde2e2] px-0.5 underline decoration-[#d93636] decoration-wavy' : ''}>{s.name}</span>
            {remove && !s.inProfile && remove({ skill: s.name })}
            {i < cv.skills.length - 1 && <span className="text-[#9a9aa3]"> ·</span>}
          </span>
        ))}
      </p>
      {cv.languages.length > 0 && (
        <>
          <h2 className={h2}>{labels.languages}</h2>
          <p>{cv.languages.map((l) => `${l.language} — ${l.level}`).join(' · ')}</p>
        </>
      )}
    </div>
  );
}
