// Drives the signed-in test browser (CDP on :9333) through a PR page and reports what the extension did.
// usage: node scripts/verify.mjs <pr-url> <screenshot.png> [--set-token]
import { chromium } from 'playwright';
import { execSync } from 'node:child_process';
const [url, shot, flag] = process.argv.slice(2);
const b = await chromium.connectOverCDP('http://localhost:9333');
const ctx = b.contexts()[0];
const ext = await ctx.newPage();
await ext.goto('chrome://extensions');
const extId = await ext.evaluate(() => chrome.developerPrivate.getExtensionsInfo().then((l) => l.find((e) => e.name === 'GitHub Review Focus').id));
if (process.env.RELOAD) { await ext.evaluate((id) => chrome.developerPrivate.reload(id, { failQuietly: true }), extId); await ext.waitForTimeout(1500); }
await ext.close();

if (flag === '--set-token') {
  const o = await ctx.newPage();
  await o.goto(`chrome-extension://${extId}/src/options.html`);
  await o.fill('#token', execSync('gh auth token').toString().trim());
  await o.click('#save');
  await o.waitForSelector('#status:has-text("Saved")');
  console.log('options:', await o.textContent('#status'));
  await o.close();
}

const p = await ctx.newPage();
await p.setViewportSize({ width: 1500, height: 1000 });
const errors = [];
p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
p.on('pageerror', (e) => errors.push('pageerror: ' + e.message.slice(0, 200)));
const apiCalls = [];
ctx.on('requestfinished', async (r) => { if (r.url().includes('api.github.com')) apiCalls.push(`${(await r.response())?.status()} ${r.url()}`); });
await p.goto(url, { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(8000);
const report = await p.evaluate(() => {
  const files = [...document.querySelectorAll('[data-details-container-group="file"][id^="diff-"], div[role="region"][id^="diff-"]')].map((el) => {
    const path = (el.dataset.tagsearchPath || el.querySelector('h3')?.textContent || '').replace(/[‎‏]/g, '').trim();
    const classicBtn = el.querySelector('button[aria-label="Toggle diff contents"]');
    const collapsed = classicBtn ? classicBtn.getAttribute('aria-expanded') === 'false' : !!el.querySelector('[data-diff-header-wrapper] button svg.octicon-chevron-right');
    return { collapsed, badges: [...el.querySelectorAll('.grf-badge')].map((x) => x.textContent).join(','), path };
  });
  const stat = document.querySelector('.grf-stat');
  return { url: location.href, user: document.querySelector('meta[name="user-login"]')?.content, counter: stat?.parentElement.innerText.replace(/\s+/g, ' ').trim(), statTitle: stat?.title, files };
});
console.log(JSON.stringify(report, null, 1));
console.log('api calls seen from page context:', apiCalls.length ? apiCalls : '(none; the worker makes them)');
console.log('console errors:', errors.length ? errors : 'none');
await p.screenshot({ path: shot });
await p.close();
await b.close();
