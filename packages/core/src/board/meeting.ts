/** Video-call hosts whose links are the interview itself, not a page about it. */
const MEETING = /https?:\/\/(?:meet\.google\.com|(?:[\w-]+\.)*zoom\.us|teams\.microsoft\.com|teams\.live\.com|(?:[\w-]+\.)*webex\.com|whereby\.com|meet\.jit\.si)\/[^\s<>"')\]]+/i;

/** The first video-call link (Meet, Zoom, Teams, Webex, Whereby, Jitsi) in a message, or null. */
export function meetingLinkIn(text: string): string | null {
  const m = MEETING.exec(text);
  if (!m) return null;
  const url = m[0].replace(/[.,;:!?]+$/, '');
  return url.length <= 500 ? url : null;
}
