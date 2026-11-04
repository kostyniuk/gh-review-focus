// Expected classification and counts for a PR, from `gh api` output on stdin.
import { classify, isRisky, reviewStats, DEFAULT_SETTINGS as S } from '../src/patterns.js';
const files = JSON.parse(await new Response(process.stdin).text()).flat();
for (const f of files) console.log(`${(classify(f.filename, S) ?? '-').padEnd(5)} ${isRisky(f.filename, S) ? 'risky' : '     '} +${f.additions} -${f.deletions} ${f.filename}`);
const t = files.reduce((a, f) => ({ a: a.a + f.additions, d: a.d + f.deletions }), { a: 0, d: 0 });
console.log('total', t, 'without tests & noise', reviewStats(files, S));
