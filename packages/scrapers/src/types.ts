import type { RawJob, SourceId } from '@jp/core';

export interface AdapterContext {
  fetchText(url: string, init?: RequestInit): Promise<string>;
  fetchJson<T = unknown>(url: string, init?: RequestInit): Promise<T>;
  env: Record<string, string | undefined>;
  /** Releases resources. Always called by the pipeline after a run. */
  dispose?(): Promise<void>;
}

export interface SourceAdapter {
  id: SourceId;
  search(params: Record<string, string>, ctx: AdapterContext): Promise<RawJob[]>;
  /**
   * Whether a stored posting is still open: false = closed or removed, null = could not tell (blocked, network).
   * Only boards that clearly mark closed vacancies implement it.
   */
  isOpen?(url: string, ctx: AdapterContext): Promise<boolean | null>;
}

/** A 404/410 from fetchText/fetchJson: the page (posting) no longer exists. */
export function isGoneError(err: unknown): boolean {
  return err instanceof Error && /HTTP (404|410) /.test(err.message);
}

export class SourceBlockedError extends Error {
  constructor(
    readonly status: number,
    url: string,
  ) {
    super(`Blocked by source (HTTP ${status}) at ${url}`);
    this.name = 'SourceBlockedError';
  }
}
