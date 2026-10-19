/** An interview as a calendar event: a Google Calendar link and an .ics file for any other calendar. */
export type CalendarEvent = { title: string; start: Date; minutes?: number; meetingUrl: string | null; details?: string | null };

const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

export function googleCalendarUrl(e: CalendarEvent): string {
  const end = new Date(e.start.getTime() + (e.minutes ?? 60) * 60_000);
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: e.title,
    dates: `${stamp(e.start)}/${stamp(end)}`,
    details: [e.meetingUrl, e.details].filter(Boolean).join('\n\n'),
    ...(e.meetingUrl ? { location: e.meetingUrl } : {}),
  });
  return `https://calendar.google.com/calendar/render?${params}`;
}

const escapeIcs = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

export function icsFile(e: CalendarEvent, uid: string, now = new Date()): string {
  const end = new Date(e.start.getTime() + (e.minutes ?? 60) * 60_000);
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//BigOffer//Interview//EN',
    'BEGIN:VEVENT',
    `UID:${uid}@bigoffer`,
    `DTSTAMP:${stamp(now)}`,
    `DTSTART:${stamp(e.start)}`,
    `DTEND:${stamp(end)}`,
    `SUMMARY:${escapeIcs(e.title)}`,
    ...(e.meetingUrl ? [`LOCATION:${escapeIcs(e.meetingUrl)}`, `URL:${e.meetingUrl}`] : []),
    ...([e.meetingUrl, e.details].filter(Boolean).length ? [`DESCRIPTION:${escapeIcs([e.meetingUrl, e.details].filter(Boolean).join('\n\n'))}`] : []),
    'BEGIN:VALARM',
    'TRIGGER:-PT30M',
    'ACTION:DISPLAY',
    'DESCRIPTION:Interview in 30 minutes',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
}
