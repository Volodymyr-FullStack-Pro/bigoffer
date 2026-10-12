// Fetches live samples from every source and trims them to 3 jobs.
// Re-run when a source changes its markup; also serves as a manual canary.
import { mkdir, writeFile } from 'node:fs/promises';

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36';
const dir = new URL('../fixtures/', import.meta.url);
await mkdir(dir, { recursive: true });

const get = async (url) => {
  const res = await fetch(url, { headers: { 'user-agent': UA } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.text();
};
const trimRss = (xml) => {
  const items = [...xml.matchAll(/<item>[\s\S]*?<\/item>/g)].slice(0, 3).map((m) => m[0]);
  return xml.replace(/<item>[\s\S]*<\/item>/, items.join('\n'));
};
const trimLdHtml = (html) => {
  const m = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  const list = JSON.parse(m[1]).filter((x) => x['@type'] === 'JobPosting').slice(0, 3);
  return `<html><body><script type="application/ld+json">${JSON.stringify(list)}</script></body></html>`;
};

const tasks = {
  'dou.xml': async () => trimRss(await get('https://jobs.dou.ua/vacancies/feeds/?search=react')),
  'djinni.html': async () => trimLdHtml(await get('https://djinni.co/jobs/?primary_keyword=JavaScript')),
  'robotaua.json': async () => {
    const d = JSON.parse(await get('https://api.rabota.ua/vacancy/search?keyWords=react&count=3'));
    return JSON.stringify({ ...d, documents: d.documents.slice(0, 3) }, null, 1);
  },
};

const only = process.argv.slice(2);
for (const [file, run] of Object.entries(tasks)) {
  if (only.length && !only.includes(file)) continue;
  try {
    await writeFile(new URL(file, dir), await run());
    console.log('✓', file);
  } catch (err) {
    console.error('✗', file, err.message);
    process.exitCode = 1;
  }
}
