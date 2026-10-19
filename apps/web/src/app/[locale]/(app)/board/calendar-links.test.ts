import { describe, expect, it } from 'vitest';
import { googleCalendarUrl, icsFile } from './calendar-links';

const e = { title: 'Interview: Unicorn Pro, Full-Stack', start: new Date('2026-10-20T15:00:00Z'), meetingUrl: 'https://meet.google.com/abc-defg-hij' };

describe('calendar links', () => {
  it('builds a Google Calendar template with an hour and the meeting link', () => {
    const u = new URL(googleCalendarUrl(e));
    expect(u.searchParams.get('dates')).toBe('20261020T150000Z/20261020T160000Z');
    expect(u.searchParams.get('location')).toBe(e.meetingUrl);
    expect(u.searchParams.get('text')).toBe(e.title);
  });
  it('builds an .ics event with a 30-minute alarm and escaped text', () => {
    const ics = icsFile(e, 'card-1', new Date('2026-10-19T10:00:00Z'));
    expect(ics).toContain('DTSTART:20261020T150000Z');
    expect(ics).toContain('SUMMARY:Interview: Unicorn Pro\\, Full-Stack');
    expect(ics).toContain('TRIGGER:-PT30M');
    expect(ics.split('\r\n')[0]).toBe('BEGIN:VCALENDAR');
  });
});
