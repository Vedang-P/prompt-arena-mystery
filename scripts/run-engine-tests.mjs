import { spawnSync } from 'node:child_process';
const run = (...args) => spawnSync(process.execPath, args, { stdio: 'inherit' }).status ?? 1;
let status;
try {
  status = run('scripts/build-case.mjs', '--case', 'case/test.yaml');
  if (!status) status = run('scripts/test-engine.mjs');
} finally {
  // Even a failed fixture test must restore the actual game for dev/deployment.
  const merged = run('scripts/merge-case.mjs');
  const compiled = merged || run('scripts/build-case.mjs');
  status ||= compiled;
}
process.exit(status);
