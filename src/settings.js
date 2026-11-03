import { DEFAULT_SETTINGS } from './patterns.js';

// Settings sync across the user's browsers. The token is kept apart, in chrome.storage.local (see options.js).
const KEYS = Object.keys(DEFAULT_SETTINGS);

export async function loadSettings() {
  const stored = await chrome.storage.sync.get(KEYS);
  return { ...DEFAULT_SETTINGS, ...stored };
}

export function saveSettings(settings) {
  return chrome.storage.sync.set(settings);
}
