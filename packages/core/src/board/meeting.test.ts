import { describe, expect, it } from 'vitest';
import { meetingLinkIn } from './meeting';

describe('meetingLinkIn', () => {
  it('finds a Meet, Zoom or Teams link and drops trailing punctuation', () => {
    expect(meetingLinkIn('Join Google Meet: https://meet.google.com/xcg-ekku-yjg.')).toBe('https://meet.google.com/xcg-ekku-yjg');
    expect(meetingLinkIn('Zoom (https://us02web.zoom.us/j/123?pwd=abc)')).toBe('https://us02web.zoom.us/j/123?pwd=abc');
    expect(meetingLinkIn('https://teams.microsoft.com/l/meetup-join/19%3a')).toBe('https://teams.microsoft.com/l/meetup-join/19%3a');
  });
  it('ignores other links', () => {
    expect(meetingLinkIn('Book a slot: https://calendly.com/acme/30min')).toBeNull();
    expect(meetingLinkIn('Opt out: https://notetaker.example.com/opt-out')).toBeNull();
  });
});
