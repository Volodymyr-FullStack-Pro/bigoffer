/** What the daily watchdog checks, outside Trigger.dev: a stopped worker cannot report itself. */
export type WatchdogInput = { lastOkRunAt: string | null; now: Date };

/** Hours of silence after which scraping counts as stopped (Djinni runs every 30 min, DOU hourly). */
export const STALE_HOURS = 3;

export function watchdogIssues({ lastOkRunAt, now }: WatchdogInput): string[] {
  if (!lastOkRunAt) return ['Парсинг ще жодного разу не відпрацював успішно.'];
  const hours = (now.getTime() - Date.parse(lastOkRunAt)) / 3_600_000;
  if (hours < STALE_HOURS) return [];
  return [
    `Парсинг не запускався ${Math.floor(hours)} год (останній успішний запуск: ${lastOkRunAt.slice(0, 16).replace('T', ' ')} UTC). ` +
      'Перевірте Trigger.dev: Billing limits і Runs.',
  ];
}
