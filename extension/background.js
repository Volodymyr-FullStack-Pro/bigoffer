// One click: open the BigOffer board with this tab's address; the board reads the page and offers the card.
// No logins or tokens here — the board uses the BigOffer session already open in the browser.
const BOARD = 'https://bigoffer-nu.vercel.app/board';

chrome.action.onClicked.addListener((tab) => {
  if (!tab.url || !/^https?:\/\//i.test(tab.url)) return;
  const target = `${BOARD}?add=${encodeURIComponent(tab.url)}&title=${encodeURIComponent((tab.title || '').slice(0, 200))}`;
  chrome.tabs.create({ url: target, index: tab.index + 1 });
});
