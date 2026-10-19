/** Djinni's relative pay level for a job without a published salary: 1 below average … 4 top. Carried as a job tag. */
export const PAY_LEVEL_TAG = 'paylevel:';
export type PayLevel = 1 | 2 | 3 | 4;

export function payLevelOf(tags: readonly string[] | null | undefined): PayLevel | null {
  const tag = (tags ?? []).find((t) => t.startsWith(PAY_LEVEL_TAG));
  const n = tag ? Number(tag.slice(PAY_LEVEL_TAG.length)) : NaN;
  return n === 1 || n === 2 || n === 3 || n === 4 ? n : null;
}
