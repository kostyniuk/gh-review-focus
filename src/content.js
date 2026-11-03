import { classify, isRisky, statsWithoutTests } from './patterns.js';
import { loadSettings } from './settings.js';

// Works on both GitHub "Files changed" pages:
//   classic: /pull/N/files   file = .file[data-details-container-group="file"], counter = #diffstat
//   new:     /pull/N/changes file = div[role="region"], counter = "Lines changed: …" in the tab bar
// In both, a file's element id is "diff-" + sha256(path), so files are matched to the API list by hash.

const PR_PATH = /^\/([^/]+)\/([^/]+)\/pull\/(\d+)(?:\/|$)/;
const FILE_SELECTOR = '[data-details-container-group="file"][id^="diff-"], div[role="region"][id^="diff-"]';
const MARK = 'data-grf';
const RETRY_MS = 500;
const COLLAPSE_WINDOW_MS = 10_000;

let settings;
let pr = null; // { key, byHash: Map<hash, file>, stats, error, handled: Set<hash>, attempts: Map<hash, {n, at, firstSeen}> }
let scheduled = false;

// ---- start ------------------------------------------------------------------

settings = await loadSettings();
chrome.storage.onChanged.addListener(async () => { settings = await loadSettings(); pr = null; onLocationChange(); });

let lastPath = location.pathname;
new MutationObserver(() => {
  if (location.pathname !== lastPath) { lastPath = location.pathname; onLocationChange(); }
  else schedule();
}).observe(document.documentElement, { childList: true, subtree: true });
for (const ev of ['turbo:render', 'soft-nav:end', 'soft-nav:react-done', 'popstate']) {
  document.addEventListener(ev, () => { lastPath = location.pathname; onLocationChange(); });
}
onLocationChange();

// A real click on a file's chevron (isTrusted; our own .click() is not) means the reviewer chose its state.
document.addEventListener('click', (e) => {
  if (!e.isTrusted || !pr) return;
  const file = e.target.closest?.(FILE_SELECTOR);
  if (file && findToggle(file)?.button.contains(e.target)) pr.handled.add(file.id.slice('diff-'.length));
}, true);

// ---- page ------------------------------------------------------------------

async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function loadPr(owner, repo, number) {
  const key = `${owner}/${repo}#${number}`;
  if (pr?.key === key) return;
  pr = { key, byHash: new Map(), stats: null, error: null, handled: new Set(), attempts: new Map() };
  const current = pr;
  const res = await chrome.runtime.sendMessage({ type: 'pr-files', owner, repo, number });
  if (current !== pr) return; // navigated away meanwhile
  if (res?.error) { pr.error = res.error; schedule(); return; }
  for (const f of res.files) pr.byHash.set(await sha256(f.filename), f);
  pr.stats = statsWithoutTests(res.files, settings);
  schedule();
}

function onLocationChange() {
  const m = location.pathname.match(PR_PATH);
  if (!m) { pr = null; return; }
  loadPr(m[1], m[2], m[3]);
  schedule();
}

function schedule() {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => { scheduled = false; render(); });
}

function render() {
  if (!pr) return;
  renderCounter();
  if (!pr.byHash.size) return;
  for (const el of document.querySelectorAll(FILE_SELECTOR)) {
    try { renderFile(el); } catch (e) { console.error('[GitHub Review Focus]', e); } // one bad file must not stop the rest
  }
}

// ---- files -----------------------------------------------------------------

function renderFile(el) {
  const hash = el.id.slice('diff-'.length);
  if (!/^[0-9a-f]{64}$/.test(hash)) return;
  const file = pr.byHash.get(hash);
  if (!file) return;

  const kind = classify(file.filename, settings);
  const risky = settings.showRiskyBadges && isRisky(file.filename, settings);
  if (el.getAttribute(MARK) !== hash) {
    el.setAttribute(MARK, hash);
    addBadges(el, kind, risky);
  } else if ((kind || risky) && !el.querySelector('.grf-badge')) {
    addBadges(el, kind, risky); // React re-rendered the header and dropped our badges
  }

  // Collapse once per page visit, so a file the reviewer re-opens stays open.
  if (pr.handled.has(hash)) return;
  const shouldCollapse = (kind === 'test' && settings.collapseTests) || (kind === 'noise' && settings.collapseNoise);
  if (!shouldCollapse) { pr.handled.add(hash); return; }
  collapse(el, hash);
}

// Two things make a single click unreliable:
//  - a click that lands before GitHub's scripts attach their handlers does nothing;
//  - on big PRs GitHub draws some files collapsed first, then expands them when their diff loads.
// So for COLLAPSE_WINDOW_MS after a file first appears we keep it collapsed, then stop. A real click by
// the reviewer on that file's chevron ends the window for it at once (see the click listener above).
function collapse(el, hash) {
  const now = Date.now();
  const c = pr.attempts.get(hash) ?? { n: 0, at: 0, firstSeen: now };
  pr.attempts.set(hash, c);
  if (now - c.firstSeen > COLLAPSE_WINDOW_MS) { pr.handled.add(hash); return; }
  setTimeout(schedule, RETRY_MS + 50); // keep checking during the window even if nothing mutates

  const toggle = findToggle(el);
  if (!toggle?.expanded || now - c.at < RETRY_MS) return;
  c.n++; c.at = now;
  el.setAttribute('data-grf-clicks', String(c.n)); // debugging aid
  toggle.button.click();
}

function findToggle(el) {
  const classic = el.querySelector('button[aria-label="Toggle diff contents"]');
  if (classic) return { button: classic, expanded: classic.getAttribute('aria-expanded') === 'true' };
  // New UI: the first header button is the chevron (tooltip "Collapse file" / "Expand file").
  const chevron = el.querySelector('[data-diff-header-wrapper] button svg.octicon-chevron-down, [data-diff-header-wrapper] button svg.octicon-chevron-right');
  if (!chevron) return null;
  return { button: chevron.closest('button'), expanded: chevron.classList.contains('octicon-chevron-down') };
}

function addBadges(el, kind, risky) {
  const anchor = el.querySelector('.file-info') // classic
    || el.querySelector('[data-diff-header-wrapper] h3')?.parentElement; // new
  if (!anchor) return;
  if (kind) anchor.append(badge(kind, kind === 'test' ? 'Test file' : 'Lockfile, snapshot or generated file'));
  if (risky) anchor.append(badge('risky', 'Matches a risky-file pattern (CI, migrations, infra, config)'));
}

function badge(kind, title) {
  const s = document.createElement('span');
  s.className = `grf-badge grf-badge-${kind}`;
  s.textContent = kind;
  s.title = title;
  return s;
}

// ---- "+X −Y" counter -------------------------------------------------------

function findCounterSlot() {
  const classic = document.querySelector('#diffstat');
  if (classic) return { container: classic, before: classic.querySelector('.color-fg-danger')?.nextSibling ?? null };
  // New UI: the PR total sits in the tab bar; per-file counters live inside file regions or the file tree.
  for (const sr of document.querySelectorAll('.sr-only')) {
    if (!sr.textContent.startsWith('Lines changed:')) continue;
    // A page-level wrapper also has an id starting with "diff-", so exclude real file sections only.
    if (sr.closest(`${FILE_SELECTOR}, [role="tree"], [role="treeitem"]`)) continue;
    return { container: sr.parentElement, before: sr };
  }
  return null;
}

function renderCounter() {
  const slot = findCounterSlot();
  if (!slot) return;
  let out = slot.container.querySelector(':scope > .grf-stat');
  if (!out) {
    out = document.createElement('span');
    out.className = 'grf-stat';
    slot.container.insertBefore(out, slot.before);
  }
  const [text, title] = counterText();
  // Write only on change: our own write is a DOM mutation, which would schedule another render.
  if (out.textContent !== text) out.textContent = text;
  out.title = title;
}

function counterText() {
  if (pr.error) return ['(?)', `GitHub Review Focus: ${pr.error}`];
  if (!pr.stats) return ['(…)', 'GitHub Review Focus: loading file list'];
  const { additions, deletions, testFiles } = pr.stats;
  return [
    `(+${additions.toLocaleString('en-US')} −${deletions.toLocaleString('en-US')} w/o tests)`,
    `Line counts without ${testFiles} test file${testFiles === 1 ? '' : 's'}`,
  ];
}
