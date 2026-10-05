// Convert between an ISO instant and a `datetime-local` value ("YYYY-MM-DDTHH:mm") in a given IANA time zone.

function wallClock(ms: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(ms));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
}

/** Offset (ms) of `timeZone` from UTC at the instant `ms`. */
function offsetAt(ms: number, timeZone: string): number {
  return wallClock(ms, timeZone) - Math.floor(ms / 1000) * 1000;
}

export function toZonedInput(iso: string | null, timeZone: string): string {
  if (!iso) return '';
  const ms = new Date(iso).getTime();
  if (Number.isNaN(ms)) return '';
  return new Date(wallClock(ms, timeZone)).toISOString().slice(0, 16);
}

export function fromZonedInput(value: string, timeZone: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!m) return null;
  const wall = Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!, +m[4]!, +m[5]!);
  // The offset is taken at the guessed instant, then re-checked at the result (handles DST transitions).
  let ms = wall - offsetAt(wall, timeZone);
  const again = wall - offsetAt(ms, timeZone);
  if (again !== ms) ms = again;
  return new Date(ms).toISOString();
}
