// Compare a verify.mjs report (file arg) with expectations computed from `gh api` JSON (second arg).
import fs from 'node:fs';
import { classify, isRisky, statsWithoutTests, DEFAULT_SETTINGS as S } from '../src/patterns.js';
const [obsFile, apiFile] = process.argv.slice(2);
const files = JSON.parse(fs.readFileSync(apiFile)).flat();
const s = fs.readFileSync(obsFile, 'utf8');
const r = JSON.parse(s.slice(s.indexOf('{'), s.indexOf('\napi calls')));
const st = statsWithoutTests(files, S);
const wantCounter = `(+${st.additions.toLocaleString('en-US')} −${st.deletions.toLocaleString('en-US')} w/o tests)`;
console.log(`counter ${r.counter?.includes(wantCounter) ? 'OK' : 'MISMATCH'}: ${r.counter?.split(' Lines')[0]} (want ${wantCounter})`);
let bad = 0;
for (const f of r.files) {
  const kind = classify(f.path, S), risky = isRisky(f.path, S);
  const wantBadges = [kind, risky && 'risky'].filter(Boolean).join(',');
  if ((kind === 'test' || kind === 'noise') !== f.collapsed || wantBadges !== f.badges) { bad++; console.log('MISMATCH', f, { kind, risky }); }
}
console.log(`files on page ${r.files.length}/${files.length}, collapsed ${r.files.filter((f) => f.collapsed).length}, mismatches ${bad}`);
console.log(s.slice(s.indexOf('console errors')).trim());
