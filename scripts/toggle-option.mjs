// Toggle a checkbox on the options page through the UI and save. usage: node scripts/toggle-option.mjs <id> <on|off>
import { chromium } from 'playwright';
const [id, state] = process.argv.slice(2);
const b = await chromium.connectOverCDP('http://localhost:9333');
const ctx = b.contexts()[0];
const ext = await ctx.newPage();
await ext.goto('chrome://extensions');
const extId = await ext.evaluate(() => chrome.developerPrivate.getExtensionsInfo().then((l) => l.find((e) => e.name === 'GitHub Review Focus').id));
await ext.goto(`chrome-extension://${extId}/src/options.html`);
await ext.locator(`#${id}`).setChecked(state === 'on');
await ext.click('#save');
await ext.waitForSelector('#status:has-text("Saved")');
console.log(id, '=', await ext.locator(`#${id}`).isChecked());
await ext.close(); await b.close();
