// Takes the README screenshots from public PRs, in the signed-in test browser (scripts/browser.sh).
// Crops to the relevant part of the page so no account details end up in the images.
import { chromium } from 'playwright';
const OUT = new URL('../docs/', import.meta.url).pathname;
const b = await chromium.connectOverCDP('http://localhost:9333');
const ctx = b.contexts()[0];

async function open(url) {
  const p = await ctx.newPage();
  await p.setViewportSize({ width: 1400, height: 1000 });
  await p.goto(url, { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('.grf-stat');
  await p.waitForTimeout(12000); // past the extension's 10 s collapse window, so the page is settled
  await p.mouse.move(0, 999);
  return p;
}

// Screenshot the box around the given elements, plus padding.
async function shoot(p, name, locators, pad = 8) {
  if (locators.length === 1) { // Playwright scrolls the element into view itself, which also works for the last file on the page
    await locators[0].screenshot({ path: OUT + name });
    console.log('wrote docs/' + name);
    return;
  }
  // GitHub scrolls smoothly; jump instead so the boxes measured below are final. Centre clears the sticky header.
  await locators[0].evaluate((el) => el.scrollIntoView({ block: 'center', behavior: 'instant' }));
  await p.waitForTimeout(500);
  const boxes = [];
  for (const l of locators) boxes.push(await l.evaluate((el) => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; }));
  const x = Math.min(...boxes.map((b) => b.x)) - pad, y = Math.min(...boxes.map((b) => b.y)) - pad;
  const right = Math.max(...boxes.map((b) => b.x + b.width)) + pad, bottom = Math.max(...boxes.map((b) => b.y + b.height)) + pad;
  await p.screenshot({ path: OUT + name, clip: { x: Math.max(0, x), y: Math.max(0, y), width: right - x, height: bottom - y } });
  console.log('wrote docs/' + name);
}

const region = (p, file) => p.locator('div[role="region"]').filter({ has: p.locator('h3', { hasText: file }) }).first();
const header = (p, file) => region(p, file).locator('[data-diff-header-wrapper]');

// 1-2: vite PR with source and tests
let p = await open('https://github.com/vitejs/vite/pull/23855/changes');
await shoot(p, 'counter.png', [p.locator('.grf-stat').locator('xpath=../..'), p.getByRole('tab', { name: /Files changed/ }).or(p.getByRole('link', { name: /Files changed/ })).first()]);
await shoot(p, 'collapse-tests.png', [header(p, 'commonTests.ts'), header(p, 'fs-serve-deny.spec.ts'), header(p, 'fs-serve.spec.ts')]);
await p.close();

// 3: a lockfile that isn't the last file (GitHub doesn't paint the last collapsed file's header off-screen)
p = await open('https://github.com/vitejs/vite/pull/23778/changes');
await shoot(p, 'collapse-noise.png', [header(p, 'pnpm-lock.yaml')]);
await p.close();

// 4: vitest PR touching a CI workflow
p = await open('https://github.com/vitest-dev/vitest/pull/11806/changes');
await shoot(p, 'risky.png', [header(p, 'ci.yml')]);
await p.close();

// 5: options page
const ext = await ctx.newPage();
await ext.goto('chrome://extensions');
const extId = await ext.evaluate(() => chrome.developerPrivate.getExtensionsInfo().then((l) => l.find((e) => e.name === 'GitHub Review Focus').id));
await ext.setViewportSize({ width: 900, height: 1080 });
await ext.emulateMedia({ colorScheme: 'dark' }); // match GitHub's dark theme in the other shots
await ext.goto(`chrome-extension://${extId}/src/options.html`);
await ext.screenshot({ path: OUT + 'options.png', fullPage: true });
console.log('wrote docs/options.png');
await ext.close();
await b.close();
