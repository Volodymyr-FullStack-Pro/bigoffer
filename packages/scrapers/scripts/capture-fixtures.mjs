// Fetches live samples from every source and trims them to 3 jobs.
// Re-run when a source changes its markup; also serves as a manual canary.
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

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

async function renderTrim(url, selector) {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ userAgent: UA, locale: 'uk-UA' });
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForSelector(selector, { timeout: 15000 });
    const cards = await page.$$eval(selector, (els) => els.slice(0, 3).map((e) => e.outerHTML));
    return `<html><body>${cards.join('\n')}</body></html>`;
  } finally {
    await browser.close();
  }
}

const pick = (list, isTech) => [...list.filter((j) => isTech(j)).slice(0, 3), ...list.filter((j) => !isTech(j)).slice(0, 1)];
const tech = (t) => /engineer|developer|front|full|software|web/i.test(t ?? '');
const trimTelegram = (html) => {
  const head = html.match(/<meta property="og:title"[^>]*>/)?.[0] ?? '';
  const posts = [...html.matchAll(/<div class="tgme_widget_message_wrap[\s\S]*?(?=<div class="tgme_widget_message_wrap|<\/section>)/g)].map((m) => m[0]);
  const jobby = posts.filter((p) => p.includes('tgme_widget_message_text'));
  return `<html><head>${head}</head><body>\n${jobby.slice(-6).join('\n')}\n</body></html>`;
};

const tasks = {
  'dou.xml': async () => trimRss(await get('https://jobs.dou.ua/vacancies/feeds/?search=react')),
  'djinni.html': async () => trimLdHtml(await get('https://djinni.co/jobs/?primary_keyword=JavaScript')),
  'remoteok.json': async () => JSON.stringify(JSON.parse(await get('https://remoteok.com/api?tag=react')).slice(0, 4), null, 1),
  'remotive.json': async () => {
    const d = JSON.parse(await get('https://remotive.com/api/remote-jobs?search=react&limit=3'));
    return JSON.stringify({ ...d, jobs: d.jobs.slice(0, 3) }, null, 1);
  },
  'himalayas.json': async () => {
    const d = JSON.parse(await get('https://himalayas.app/jobs/api/search?q=react&limit=3'));
    return JSON.stringify({ ...d, jobs: d.jobs.slice(0, 3) }, null, 1);
  },
  'robotaua.json': async () => {
    const d = JSON.parse(await get('https://api.rabota.ua/vacancy/search?keyWords=react&count=3'));
    return JSON.stringify({ ...d, documents: d.documents.slice(0, 3) }, null, 1);
  },
  'hn-search.json': async () => get('https://hn.algolia.com/api/v1/search_by_date?tags=story,author_whoishiring&hitsPerPage=5'),
  'hn-item.json': async () => {
    const search = JSON.parse(await get('https://hn.algolia.com/api/v1/search_by_date?tags=story,author_whoishiring&hitsPerPage=5'));
    const hit = search.hits.find((h) => h.title.startsWith('Ask HN: Who is hiring?'));
    const item = JSON.parse(await get(`https://hn.algolia.com/api/v1/items/${hit.objectID}`));
    return JSON.stringify({ ...item, children: item.children.filter((c) => c.text).slice(0, 3) }, null, 1);
  },
  'workingnomads.json': async () => JSON.stringify(JSON.parse(await get('https://www.workingnomads.com/api/exposed_jobs/')).slice(0, 3), null, 1),
  'linkedin.html': async () => {
    const html = await get('https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?keywords=react&location=Ukraine&start=0');
    return [...html.matchAll(/<li>[\s\S]*?<\/li>/g)].slice(0, 3).map((m) => m[0]).join('\n');
  },
  'workua.html': async () => renderTrim('https://www.work.ua/jobs-remote-react/', 'div.card.job-link'),
  'greenhouse.json': async () => {
    const d = JSON.parse(await get('https://boards-api.greenhouse.io/v1/boards/gitlab/jobs?content=true'));
    return JSON.stringify({ jobs: pick(d.jobs, (j) => tech(j.title)) }, null, 1);
  },
  'lever.json': async () => JSON.stringify(pick(JSON.parse(await get('https://api.lever.co/v0/postings/spotify?mode=json')), (j) => tech(j.text)), null, 1),
  'ashby.json': async () => {
    const d = JSON.parse(await get('https://api.ashbyhq.com/posting-api/job-board/supabase'));
    return JSON.stringify({ jobs: pick(d.jobs, (j) => tech(j.title)) }, null, 1);
  },
  'workable.json': async () => {
    const d = JSON.parse(await get('https://apply.workable.com/api/v1/widget/accounts/modash'));
    return JSON.stringify({ ...d, jobs: pick(d.jobs, (j) => tech(j.title)) }, null, 1);
  },
  'telegram.html': async () => trimTelegram(await get('https://t.me/s/job_it_junior')),
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
