import type { SourceId } from './job';
import { queryKey, type SourceQuerySpec } from './search';

const TECH = /\b(engineer|engineering|developer|dev|programmer|swe|sre|devops|front[- ]?end|back[- ]?end|full[- ]?stack|software|web|react|angular|vue|node(\.js)?|typescript|javascript|mobile|ios|android|qa|tester|architect|data|ml|ai)\b|розробник|разработчик|програміст|программист|інженер|инженер/i;

/** Board feeds return every role a company has; keep the technical ones. */
export function isTechTitle(title: string): boolean {
  return TECH.test(title);
}

export type BoardRef = { sourceId: SourceId; slug: string };

/** One shared query per board of an enabled source (deduplicated across users by queryKey). */
export function boardQuerySpecs(boards: BoardRef[], enabled: readonly SourceId[]): SourceQuerySpec[] {
  const on = new Set(enabled);
  return boards
    .filter((b) => on.has(b.sourceId))
    .map((b) => {
      const params = { board: b.slug };
      return { sourceId: b.sourceId, params, queryKey: queryKey(b.sourceId, params) };
    });
}
