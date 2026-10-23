// The BigOffer site; the extension may talk only to it (host_permissions), with the session already in the browser.
const SITE = 'https://bigoffer-nu.vercel.app';
const status = document.getElementById('status');
const say = (text) => (status.textContent = text);

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

// Save: open the board with this page; the board reads it and offers the card.
document.getElementById('save').addEventListener('click', async () => {
  const tab = await activeTab();
  if (!tab?.url || !/^https?:\/\//i.test(tab.url)) return say('This page cannot be saved.');
  const url = `${SITE}/board?add=${encodeURIComponent(tab.url)}&title=${encodeURIComponent((tab.title || '').slice(0, 200))}`;
  await chrome.tabs.create({ url, index: tab.index + 1 });
  window.close();
});

// Runs in the page: every visible empty text field, numbered, with the text that says what it asks for.
function collectFields() {
  const visible = (el) => el.offsetParent !== null && !el.disabled && !el.readOnly;
  const labelOf = (el) => {
    const byFor = el.id && document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
    const wrap = el.closest('label');
    const near = el.closest('div,fieldset,li')?.querySelector('label,legend,[class*="label" i]');
    return (el.getAttribute('aria-label') || byFor?.innerText || wrap?.innerText || near?.innerText || el.placeholder || el.name || '').trim().slice(0, 300);
  };
  const out = [];
  document.querySelectorAll('input, textarea').forEach((el) => {
    const type = el.tagName === 'TEXTAREA' ? 'textarea' : (el.type || 'text').toLowerCase();
    if (!['text', 'email', 'tel', 'url', 'number', 'textarea', 'search'].includes(type) || !visible(el) || el.value) return;
    el.dataset.boFill = String(out.length);
    out.push({ label: labelOf(el), type });
  });
  return out.slice(0, 80);
}

// Runs in the page: sets each value the way a person typing would, so the page's own scripts notice.
function fillFields(values) {
  let filled = 0;
  document.querySelectorAll('[data-bo-fill]').forEach((el) => {
    const v = values[Number(el.dataset.boFill)];
    delete el.dataset.boFill;
    if (!v) return;
    const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    filled++;
  });
  return filled;
}

document.getElementById('fill').addEventListener('click', async () => {
  const tab = await activeTab();
  if (!tab?.id) return;
  say('Reading the form…');
  try {
    const [{ result: fields }] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: collectFields });
    if (!fields.length) return say('No empty fields to fill on this page.');
    const res = await fetch(`${SITE}/api/ext/autofill`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields }),
    });
    if (res.status === 401) return say('Sign in to BigOffer in this browser first.');
    if (!res.ok) return say('Could not fill the form. Try again.');
    const { values } = await res.json();
    const [{ result: filled }] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: fillFields, args: [values] });
    say(filled ? `Filled ${filled} of ${fields.length} fields. Check them before sending.` : 'Nothing matched your profile or saved answers.');
  } catch {
    say('This page does not allow filling.');
  }
});
