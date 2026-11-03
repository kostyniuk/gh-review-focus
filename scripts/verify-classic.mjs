// Classic "Files changed" page, signed out, fresh profile. usage: node scripts/verify-classic.mjs <url> <out.png> [--no-extension]
import { chromium } from 'playwright';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const [url, shot, flag] = process.argv.slice(2);
const ext = path.resolve(import.meta.dirname, '..');
const dir = fs.mkdtempSync(path.join(process.env.TMPDIR || os.tmpdir(), 'grf-classic-'));
const args = flag === '--no-extension' ? [] : [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`];
const ctx = await chromium.launchPersistentContext(dir, { channel: 'chromium', headless: true, args, viewport: { width: 1500, height: 1000 } });
const p = await ctx.newPage();
const errors = [];
p.on('pageerror', (e) => errors.push(e.message.slice(0, 200)));
await p.goto(url, { waitUntil: 'networkidle' });
await p.waitForTimeout(4000);
const r = await p.evaluate(() => ({
  url: location.href,
  signedIn: !!document.querySelector('meta[name="user-login"]')?.content,
  counter: document.querySelector('#diffstat')?.innerText.replace(/\s+/g, ' ').trim(),
  statTitle: document.querySelector('.grf-stat')?.title,
  files: [...document.querySelectorAll('[data-details-container-group="file"][id^="diff-"]')].map((el) => ({
    collapsed: el.querySelector('button[aria-label="Toggle diff contents"]')?.getAttribute('aria-expanded') === 'false',
    badges: [...el.querySelectorAll('.grf-badge')].map((x) => x.textContent).join(','),
    path: el.dataset.tagsearchPath,
  })),
}));
console.log(JSON.stringify(r, null, 1));
console.log('api calls seen from page context: n/a');
console.log('console errors:', errors.length ? errors : 'none');
await p.screenshot({ path: shot });
await ctx.close();
fs.rmSync(dir, { recursive: true, force: true });
