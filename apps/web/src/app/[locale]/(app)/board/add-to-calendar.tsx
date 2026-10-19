'use client';

import { CalendarPlus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { type CalendarEvent, googleCalendarUrl, icsFile } from './calendar-links';

/** "Add to calendar": Google Calendar in a new tab, or an .ics file for Apple/Outlook. */
export function AddToCalendar({ event, uid }: { event: CalendarEvent; uid: string }) {
  const t = useTranslations('board');
  const ics = `data:text/calendar;charset=utf-8,${encodeURIComponent(icsFile(event, uid))}`;
  return (
    <span className="inline-flex items-center gap-2">
      <a
        href={googleCalendarUrl(event)}
        target="_blank"
        rel="noopener noreferrer"
        data-testid="add-to-calendar"
        className="brutal brutal-press inline-flex items-center gap-1.5 px-3 py-1 text-sm font-semibold"
      >
        <CalendarPlus aria-hidden className="size-4" /> {t('addToCalendar')}
      </a>
      <a href={ics} download="interview.ics" data-testid="add-to-calendar-ics" className="text-xs text-muted-foreground underline hover:text-foreground">
        .ics
      </a>
    </span>
  );
}
