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
