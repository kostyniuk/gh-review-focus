import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classify, isRisky, statsWithoutTests, DEFAULT_SETTINGS as S } from './patterns.js';

const cases = {
  test: [
    'apps/web/services/__tests__/api.test.ts',
    'apps/web/tests/playwright/tests/login.spec.ts',
    'apps/api/src/test-helpers/create-test-user.ts',
    'packages/core/src/user.mapper.test.ts',
    'apps/web/components/Button.test.tsx',
    'test/types/config.test-d.ts',
    'pkg/server/handler_test.go',
    'tests/test_parser.py',
    'packages/core/__snapshots__/a.test.ts.snap',
  ],
  noise: ['bun.lock', 'yarn.lock', 'web/package-lock.json', 'packages/db/drizzle/meta/0009_snapshot.json', 'src/api.generated.ts', 'go.sum'],
  // Look like tests by name but are product code: must stay untouched.
  null: [
    'apps/web/features/notifications/components/send-test-notification-button.tsx',
    'apps/web/features/forms/helpers/is-dirty-snapshot.ts',
    'apps/web/components/filters/specific-event.tsx',
    'apps/web/utils/latest.ts',
    'src/contest/index.ts',
    'README.md',
  ],
};

for (const [want, paths] of Object.entries(cases)) {
  for (const p of paths) {
    test(`${p} -> ${want}`, () => assert.equal(classify(p, S), want === 'null' ? null : want));
  }
}

test('risky', () => {
  assert.ok(isRisky('.github/workflows/ci.yml', S));
  assert.ok(isRisky('apps/api/Dockerfile', S));
  assert.ok(isRisky('packages/db/drizzle/0010_add_col.sql', S));
  assert.ok(isRisky('db/migrations/2026_add_users.sql', S));
  assert.ok(isRisky('apps/web/vercel.json', S));
  assert.ok(!isRisky('apps/web/pages/index.tsx', S));
});

test('stats exclude tests only', () => {
  const r = statsWithoutTests([
    { filename: 'src/a.ts', additions: 10, deletions: 2 },
    { filename: 'src/a.test.ts', additions: 50, deletions: 5 },
    { filename: 'bun.lock', additions: 7, deletions: 1 },
  ], S);
  assert.deepEqual(r, { additions: 17, deletions: 3, testFiles: 1 });
});
