// Fetches PR file lists from the GitHub API. Runs here, not in the content script, so only this worker reads the token.
const PER_PAGE = 100;
const MAX_PAGES = 30; // the endpoint returns at most 3,000 files
// Short cache so tab switches within a PR don't refetch; a minute is short enough to pick up new pushes.
const cache = new Map(); // "owner/repo#n" -> { at, value }
const TTL_MS = 60_000;

async function fetchPrFiles({ owner, repo, number }) {
  const key = `${owner}/${repo}#${number}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;

  const { token } = await chrome.storage.local.get('token');
  const headers = { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
  if (token) headers.Authorization = `Bearer ${token}`;

  const files = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const url = `https://api.github.com/repos/${owner}/${repo}/pulls/${number}/files?per_page=${PER_PAGE}&page=${page}`;
    const res = await fetch(url, { headers });
    if (!res.ok) {
      const hint = res.status === 404 && !token ? 'private repo? add a token in the extension options'
        : res.status === 403 || res.status === 429 ? 'rate limited; add a token in the extension options'
        : res.statusText;
      return { error: `GitHub API ${res.status}: ${hint}` };
    }
    const batch = await res.json();
    files.push(...batch.map(({ filename, additions, deletions, status }) => ({ filename, additions, deletions, status })));
    if (batch.length < PER_PAGE) break;
  }
  const value = { files };
  cache.set(key, { at: Date.now(), value });
  return value;
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === 'pr-files') {
    fetchPrFiles(msg).then(sendResponse, (e) => sendResponse({ error: String(e) }));
    return true; // async response
  }
});
