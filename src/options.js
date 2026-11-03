import { DEFAULT_SETTINGS, parseSettingsText } from './patterns.js';
import { loadSettings, saveSettings } from './settings.js';

const lists = ['testPatterns', 'noisePatterns', 'riskyPatterns'];
const flags = ['collapseTests', 'collapseNoise', 'showRiskyBadges'];
const $ = (id) => document.getElementById(id);

function fill(s) {
  for (const k of lists) $(k).value = s[k].join('\n');
  for (const k of flags) $(k).checked = s[k];
}

fill(await loadSettings());
$('token').value = (await chrome.storage.local.get('token')).token ?? '';

$('save').onclick = async () => {
  const s = {};
  for (const k of lists) s[k] = parseSettingsText($(k).value);
  for (const k of flags) s[k] = $(k).checked;
  await saveSettings(s);
  const token = $('token').value.trim();
  await (token ? chrome.storage.local.set({ token }) : chrome.storage.local.remove('token'));
  $('status').textContent = 'Saved. Reload the PR page.';
};

$('reset').onclick = () => {
  const cur = { ...DEFAULT_SETTINGS };
  for (const k of flags) cur[k] = $(k).checked;
  fill(cur);
  $('status').textContent = 'Defaults restored; press Save to keep them.';
};
