import type { RawJob, SourceId } from '@jp/core';

export interface AdapterContext {
  fetchText(url: string, init?: RequestInit): Promise<string>;
  fetchJson<T = unknown>(url: string, init?: RequestInit): Promise<T>;
  env: Record<string, string | undefined>;
}

export interface SourceAdapter {
  id: SourceId;
  /** Sources that need credentials report false when they are missing; the pipeline then skips them. */
  isConfigured?(env: Record<string, string | undefined>): boolean;
  search(params: Record<string, string>, ctx: AdapterContext): Promise<RawJob[]>;
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
