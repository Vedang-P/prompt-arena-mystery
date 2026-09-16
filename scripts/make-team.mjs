#!/usr/bin/env node
// Generates seed SQL for a team code.
//   node scripts/make-team.mjs "TEAM-042" PANDA-7K2 >> seed.sql

import { hashCode } from '../src/auth.js';

const [name, code] = process.argv.slice(2);
if (!name || !code) {
  console.error('usage: node scripts/make-team.mjs "TEAM-042" PANDA-7K2');
  process.exit(1);
}
const hash = await hashCode(code, process.env.CODE_PEPPER || 'dev-pepper');
console.log(
  `INSERT OR IGNORE INTO teams(name, code_hash) VALUES ('${name.replace(/'/g, "''")}', '${hash}');`
);
