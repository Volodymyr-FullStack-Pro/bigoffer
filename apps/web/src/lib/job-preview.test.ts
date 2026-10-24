import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
const { isPublicIp, parseJobPreview } = await import('./job-preview');

describe('isPublicIp', () => {
  it('rejects private, loopback, link-local and unspecified addresses', () => {
    for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254', '0.0.0.0', '100.64.0.1', '::1', '::', 'fc00::1', 'fd12::1', 'fe80::1', '::ffff:127.0.0.1', '::ffff:10.0.0.1', '::ffff:7f00:1', '::ffff:a9fe:a9fe', '64:ff9b::7f00:1', '2002:7f00:1::', '2001:db8::1', 'fec0::1', 'ff02::1', '192.0.2.1', '198.18.0.1', '192.0.0.1', '255.255.255.255', 'not-an-ip']) {
      expect(isPublicIp(ip), ip).toBe(false);
    }
  });
  it('accepts public addresses', () => {
    for (const ip of ['8.8.8.8', '172.32.0.1', '1.1.1.1', '2a00:1450:4001::200e', '::ffff:8.8.8.8', '::ffff:808:808', '2606:4700:4700::1111']) {
      expect(isPublicIp(ip), ip).toBe(true);
    }
  });
});

describe('parseJobPreview', () => {
  it('prefers JSON-LD JobPosting', () => {
    const html = `<html><head><title>x</title><script type="application/ld+json">${JSON.stringify({
      '@type': 'JobPosting',
      title: 'Senior Full Stack Developer',
      hiringOrganization: { name: 'Acme' },
      jobLocation: { address: { addressLocality: 'Kyiv' } },
      baseSalary: { currency: 'USD', value: { minValue: 4000, maxValue: 5000, unitText: 'MONTH' } },
    })}</script></head></html>`;
    expect(parseJobPreview(html)).toEqual({ title: 'Senior Full Stack Developer', company: 'Acme', location: 'Kyiv', salary: '4000–5000 USD / MONTH' });
  });
  it('falls back to Open Graph and the title tag', () => {
    const html = '<html><head><meta property="og:title" content="Backend Engineer &amp; Lead"><meta property="og:site_name" content="Globex"><title>ignored</title></head></html>';
    expect(parseJobPreview(html)).toEqual({ title: 'Backend Engineer & Lead', company: 'Globex', location: null, salary: null });
    expect(parseJobPreview('<title> Plain title </title>').title).toBe('Plain title');
  });
});

// Timing-based: run in isolation (PERF=1, a dedicated CI step), not alongside other packages' suites competing for CPU.
describe.skipIf(!process.env.PERF)('parseJobPreview is linear on adversarial input', () => {
  // parseJobPreview caps input at 512_000 chars, so stay below it: N and 4N are real sizes.
  const N = 100_000;
  const rep = (unit: string, size: number) => unit.repeat(Math.max(1, Math.floor(size / unit.length)));
  const cases: Record<string, (size: number) => string> = {
    meta: (n) => rep('<meta ', n),
    'title tags': (n) => rep('<title>', n),
    'title tags closed': (n) => `${rep('<title>', n)}</title>`,
    'long meta tags': (n) => rep(`<meta ${'a'.repeat(4000)}>`, n),
    'long script tags': (n) => rep(`<script ${'a'.repeat(4000)}>`, n),
    'long script tags closed': (n) => rep(`<script ${'a'.repeat(4000)}>x</script>`, n),
    'long attr names with equals': (n) => rep(`<meta ${'a='.repeat(2000)}>`, n),
    script: (n) => rep('<script ', n),
    title: (n) => rep('<title ', n),
    'script no close': (n) => `<script type="application/ld+json">${'{'.repeat(n)}`,
    'many name attrs': (n) => `<meta ${rep('name="og:title" ', n)}content="x">`,
    'unterminated meta': (n) => `<meta property="og:title" ${'a'.repeat(n)}`,
  };
  // Per-iteration time from a loop of ≥ 50 ms (single parses take ~1 ms, too noisy to compare), median of 3,
  // after a warm-up, so timer noise on a busy CI runner does not decide.
  const once = (html: string): number => {
    let iterations = 0;
    const start = performance.now();
    let elapsed = 0;
    do {
      parseJobPreview(html);
      iterations += 1;
      elapsed = performance.now() - start;
    } while (elapsed < 50);
    return elapsed / iterations;
  };
  const time = (html: string): number => {
    parseJobPreview(html);
    // Median of 5 runs: CI noise produced an outlier ratio of 8.37 with 3 runs.
    return [once(html), once(html), once(html), once(html), once(html)].sort((x, y) => x - y)[2]!;
  };
  for (const [name, gen] of Object.entries(cases)) {
    it(`scales linearly on ${name}`, () => {
      const small = time(gen(N));
      const large = time(gen(4 * N));
      const ratio = large / Math.max(small, 0.05);
      console.log(`redos ${name}: ${small.toFixed(1)} ms -> ${large.toFixed(1)} ms (x${ratio.toFixed(1)})`);
      // linear ~4x, quadratic ~16x; threshold 10 leaves headroom for CI noise (seen 8.37 on a linear path) while
      // staying well below quadratic. Sub-5 ms timings are dominated by timer/GC noise and cannot hide a quadratic
      // path (which takes hundreds of ms at 400 KB), so only meaningful durations are compared.
      if (large >= 5) expect(ratio).toBeLessThan(10);
      // generous backstop for catastrophic regressions
      expect(large).toBeLessThan(1500);
    });
  }
  it('caps returned strings', () => {
    const p = parseJobPreview(`<meta property="og:title" content="${'a'.repeat(1000)}">`);
    expect(p.title).toHaveLength(300);
  });
  it('reads meta tags with either attribute order', () => {
    expect(parseJobPreview('<head><meta content="Acme" name="og:site_name"></head>').company).toBe('Acme');
  });
});

describe('parseJobPreview, a recruiter post', () => {
  it('takes the role the post names as the title and its author as the recruiter', () => {
    const html = `<html><head>
      <meta property="og:site_name" content="LinkedIn">
      <title>Шукаю Jun+/Middle Full-Stack Developer і вирішила спробувати написати ще й тут - раптом комусь відгукнеться ця можливість :) Стек: React + TypeScript Node.js | Daryna Vasylieva | коментарі (22)</title>
      <meta name="description" content="Стек: React + TypeScript, Node.js (NestJS або Express)">
    </head></html>`;
    expect(parseJobPreview(html)).toMatchObject({ title: 'Jun+/Middle Full-Stack Developer', company: null, recruiter: 'Daryna Vasylieva' });
  });
});
