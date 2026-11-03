// 1) open the Conversation tab, click "Files changed" (client-side navigation), check the extension ran.
// 2) re-expand a collapsed test file by clicking its chevron, wait, check it stays expanded.
import { chromium } from 'playwright';
const [url, shot] = process.argv.slice(2);
const b = await chromium.connectOverCDP('http://localhost:9333');
const p = await b.contexts()[0].newPage();
await p.setViewportSize({ width: 1500, height: 1000 });
const errors = [];
p.on('pageerror', (e) => errors.push(e.message.slice(0, 200)));
p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
await p.goto(url, { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(3000);
const navType = () => p.evaluate(() => performance.getEntriesByType('navigation')[0].name);
const firstDoc = await navType();
await p.getByRole('tab', { name: /Files changed/ }).or(p.getByRole('link', { name: /Files changed/ })).first().click();
await p.waitForTimeout(+(process.env.NAV_WAIT ?? 7000));
const state = () => p.evaluate(() => [...document.querySelectorAll('div[role="region"][id^="diff-"], [data-details-container-group="file"][id^="diff-"]')].map((el) => ({
  path: (el.dataset.tagsearchPath || el.querySelector('h3')?.textContent || '').replace(/[‎‏]/g, '').trim(),
  collapsed: !!el.querySelector('[data-diff-header-wrapper] button svg.octicon-chevron-right') || el.querySelector('button[aria-label="Toggle diff contents"]')?.getAttribute('aria-expanded') === 'false',
  badge: el.querySelector('.grf-badge')?.textContent ?? '',
})));
console.log('url after click:', p.url(), '| same document (soft nav):', firstDoc === (await navType()));
console.log('counter:', await p.locator('.grf-stat').first().textContent().catch(() => 'MISSING'));
const s1 = await state();
console.log('after nav:', s1.map((f) => `${f.collapsed ? 'C' : 'o'} ${f.badge || '-'} ${f.path.split('/').pop()}`).join(' | '));
const target = s1.find((f) => f.collapsed && f.badge === 'test');
const region = p.locator(`div[role="region"]:has(h3:has-text("${target.path.split('/').pop()}"))`);
await region.locator('[data-diff-header-wrapper] button').first().click();
await p.waitForTimeout(3000);
const s2 = await state();
console.log(`re-expanded ${target.path.split('/').pop()}; 3s later collapsed =`, s2.find((f) => f.path === target.path).collapsed);
await region.scrollIntoViewIfNeeded();
await p.screenshot({ path: shot });
console.log('errors:', errors.length ? errors : 'none');
await p.close(); await b.close();
