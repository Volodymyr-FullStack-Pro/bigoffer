/** Daily application goal (Offer Genie, Telegram digest). */

/** Days met / idle counted from a list of local dates (YYYY-MM-DD) of applications, yesterday backwards. */
export function streaks(appliedDates: readonly string[], today: string, goal: number): { streak: number; idleDays: number } {
  // Someone who has not applied yet is new, not idle.
  if (appliedDates.length === 0) return { streak: 0, idleDays: 0 };
  const perDay = new Map<string, number>();
  for (const d of appliedDates) perDay.set(d, (perDay.get(d) ?? 0) + 1);
  const back = (n: number) => {
    const d = new Date(`${today}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() - n);
    return d.toISOString().slice(0, 10);
  };
  let streak = 0;
  while ((perDay.get(back(streak + 1)) ?? 0) >= goal) streak++;
  let idleDays = 0;
  while (idleDays < 14 && (perDay.get(back(idleDays + 1)) ?? 0) === 0) idleDays++;
  return { streak, idleDays };
}
