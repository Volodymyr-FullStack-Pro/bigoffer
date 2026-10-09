const MONTHS: Record<string, number> = {
  січня: 0, лютого: 1, березня: 2, квітня: 3, травня: 4, червня: 5,
  липня: 6, серпня: 7, вересня: 8, жовтня: 9, листопада: 10, грудня: 11,
  января: 0, февраля: 1, марта: 2, апреля: 3, мая: 4, июня: 5,
  июля: 6, августа: 7, сентября: 8, октября: 9, ноября: 10, декабря: 11,
};

export function parseUkDate(text: string): Date | null {
  const m = text.toLowerCase().match(/(\d{1,2})\s+([\p{L}]+)\s+(\d{4})/u);
  if (!m) return null;
  const month = MONTHS[m[2]!];
  if (month === undefined) return null;
  return new Date(Date.UTC(Number(m[3]), month, Number(m[1])));
}

const NO_OFFSET = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/;

/**
 * A board timestamp without a zone ("2026-10-09T18:00:00") read as Kyiv wall-clock time (DST-aware);
 * strings that carry a zone are parsed as given. Reading such stamps as UTC put jobs up to 3 h in the future.
 */
export function kyivLocalDate(value: string): Date | null {
  const text = value.trim();
  if (!NO_OFFSET.test(text)) {
    const d = new Date(text);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const asUtc = new Date(`${text.replace(' ', 'T')}Z`);
  if (Number.isNaN(asUtc.getTime())) return null;
  // Kyiv's offset at that moment: format the instant in Kyiv and compare with UTC.
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Kyiv',
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(asUtc);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const kyivAsUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return new Date(asUtc.getTime() - (kyivAsUtc - asUtc.getTime()));
}

