// Clear the token through the options page, open a private PR, check the error counter and that it doesn't re-render in a loop.
import { chromium } from 'playwright';
const [url] = process.argv.slice(2);
const b = await chromium.connectOverCDP('http://localhost:9333');
const ctx = b.contexts()[0];
const ext = await ctx.newPage();
await ext.goto('chrome://extensions');
const extId = await ext.evaluate(() => chrome.developerPrivate.getExtensionsInfo().then((l) => l.find((e) => e.name === 'GitHub Review Focus').id));
await ext.goto(`chrome-extension://${extId}/src/options.html`);
await ext.fill('#token', '');
await ext.click('#save');
await ext.close();
const p = await ctx.newPage();
await p.goto(url, { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(7000);
const r = await p.evaluate(async () => {
  const el = document.querySelector('.grf-stat');
  let writes = 0;
  const mo = new MutationObserver((ms) => { writes += ms.length; });
  mo.observe(el, { childList: true, characterData: true, subtree: true });
  await new Promise((res) => setTimeout(res, 2000));
  mo.disconnect();
  return { text: el.textContent, title: el.title, writesIn2s: writes, collapsed: document.querySelectorAll('[data-diff-header-wrapper] button svg.octicon-chevron-right').length };
});
console.log(JSON.stringify(r));
await p.close(); await b.close();
