import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
const httpGet = vi.fn();
const httpsGet = vi.fn();
vi.mock('node:http', () => ({ default: { get: httpGet } }));
vi.mock('node:https', () => ({ default: { get: httpsGet } }));
const { checkTarget, fetchJobPreview, guardedLookup } = await import('./job-preview');

beforeEach(() => {
  httpGet.mockReset();
  httpsGet.mockReset();
});

describe('checkTarget', () => {
  it('allows plain public http(s)', () => {
    expect(checkTarget(new URL('https://example.com/job'))).toBe(true);
    expect(checkTarget(new URL('http://8.8.8.8/'))).toBe(true);
    expect(checkTarget(new URL('https://example.com:443/'))).toBe(true);
  });
  it('rejects other protocols, ports and credentials', () => {
    for (const u of ['ftp://example.com/', 'file:///etc/passwd', 'http://example.com:8080/', 'https://example.com:22/', 'https://user:pw@example.com/', 'https://user@example.com/']) {
      expect(checkTarget(new URL(u)), u).toBe(false);
    }
  });
});

describe('guardedLookup', () => {
  const run = (options: { all?: boolean }) =>
    new Promise<NodeJS.ErrnoException | null>((resolve) => {
      (guardedLookup as unknown as (h: string, o: object, cb: (e: NodeJS.ErrnoException | null) => void) => void)('localhost', options, (e) => resolve(e));
    });
  it('blocks localhost with { all: true }', async () => {
    expect((await run({ all: true }))?.code).toBe('EBLOCKED');
  });
  it('blocks localhost with default options', async () => {
    expect((await run({}))?.code).toBe('EBLOCKED');
  });
});

describe('fetchJobPreview never connects to non-public literals', () => {
  for (const u of ['http://[::ffff:7f00:1]/', 'http://0x7f.1/', 'http://2130706433/', 'http://[fd00:ec2::254]/', 'http://169.254.169.254/', 'http://127.0.0.1/', 'http://[::1]/', 'https://10.0.0.1/', 'http://127.0.0.1:54321/']) {
    it(u, async () => {
      expect(await fetchJobPreview(u)).toBeNull();
      expect(httpGet).not.toHaveBeenCalled();
      expect(httpsGet).not.toHaveBeenCalled();
    });
  }
  it('rejects non-http protocols without connecting', async () => {
    expect(await fetchJobPreview('file:///etc/passwd')).toBeNull();
    expect(httpGet).not.toHaveBeenCalled();
  });
});
