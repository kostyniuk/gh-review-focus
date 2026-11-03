// Glob matching for file paths. Shared by the content script, options page and tests.
// Rules (gitignore-like):
//   - a pattern with no "/" matches the file name in any folder ("*.test.*", "bun.lock")
//   - "**" matches any number of folders, "*" anything except "/", "?" one character
//   - a pattern ending in "/**" matches everything under that folder

export const DEFAULT_SETTINGS = {
  testPatterns: [
    '**/__tests__/**',
    '**/tests/**',
    '**/test/**',
    '**/test-helpers/**',
    '**/__mocks__/**',
    '**/__snapshots__/**',
    '**/e2e/**',
    '*.test.*',
    '*.spec.*',
    '*.test-d.ts',
    '*_test.go',
    'test_*.py',
    '*_test.py',
  ],
  noisePatterns: [
    '*.lock',
    'package-lock.json',
    'pnpm-lock.yaml',
    'go.sum',
    '*.snap',
    '*.min.js',
    '*.min.css',
    '**/drizzle/meta/**',
    '**/generated/**',
    '*.generated.*',
  ],
  riskyPatterns: [
    '.github/workflows/**',
    '.github/CODEOWNERS',
    'CODEOWNERS',
    '**/migrations/**',
    '**/drizzle/*.sql',
    'Dockerfile',
    '*.Dockerfile',
    'docker-compose*.yml',
    '*.tf',
    '.env*',
    'vercel.json',
    'turbo.json',
  ],
  collapseTests: true,
  collapseNoise: true,
  showRiskyBadges: true,
};

const cache = new Map();

export function globToRegExp(pattern) {
  if (cache.has(pattern)) return cache.get(pattern);
  const anchored = pattern.includes('/');
  let p = pattern.replace(/^\//, '');
  let re = '';
  for (let i = 0; i < p.length; i++) {
    const c = p[i];
    if (c === '*' && p[i + 1] === '*') {
      i++;
      if (p[i + 1] === '/') { i++; re += '(?:.*/)?'; } // "**/" = zero or more folders
      else re += '.*';
    } else if (c === '*') re += '[^/]*';
    else if (c === '?') re += '[^/]';
    else re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  const rx = new RegExp(anchored ? `^${re}$` : `(?:^|/)${re}$`);
  cache.set(pattern, rx);
  return rx;
}

export function matchesAny(path, patterns) {
  return patterns.some((pattern) => globToRegExp(pattern).test(path));
}

/** Returns 'test' | 'noise' | null. Tests win over noise (a test snapshot is a test file). */
export function classify(path, settings) {
  if (matchesAny(path, settings.testPatterns)) return 'test';
  if (matchesAny(path, settings.noisePatterns)) return 'noise';
  return null;
}

export function isRisky(path, settings) {
  return matchesAny(path, settings.riskyPatterns);
}

/** Sums additions/deletions of files that are not tests. `files` is the REST pulls/files shape. */
export function statsWithoutTests(files, settings) {
  let additions = 0, deletions = 0, testFiles = 0;
  for (const f of files) {
    if (matchesAny(f.filename, settings.testPatterns)) { testFiles++; continue; }
    additions += f.additions;
    deletions += f.deletions;
  }
  return { additions, deletions, testFiles };
}

export function parseSettingsText(text) {
  return text.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
}
