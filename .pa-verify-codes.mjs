import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

const BASE = 'https://prompt-arena-mystery.vercel.app';
const readEnv = (file) => {
  const out = {};
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m) out[m[1]] = m[2].trim().replace(/^"|"$/g, '');
  }
  return out;
};
const prod = readEnv(process.argv[2]);

const rows = fs.readFileSync('event-private/team-codes.csv', 'utf8').split('\n')
  .map((line) => line.trim())
  .filter((line) => line && !/^team\s*,\s*code$/i.test(line))
  .map((line) => {
    const at = line.indexOf(',');
    return { name: line.slice(0, at).trim(), code: line.slice(at + 1).trim() };
  })
  .filter((r) => r.name && r.code);
console.log('codes in roster:', rows.length);

const working = [];
const failed = [];
for (const row of rows) {
  let status = 0;
  try {
    const res = await fetch(`${BASE}/api/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code: row.code }),
      signal: AbortSignal.timeout(20000),
    });
    status = res.status;
  } catch {
    status = 0;
  }
  if (status === 200) working.push(row);
  else failed.push({ ...row, status });
}
console.log('working:', working.length, 'failed:', failed.length);
if (failed.length) console.log('failed rows:', failed.map((f) => `${f.name}(${f.status})`).join(', '));

// Login marks a team as eventEntered; restore the pristine flags for the rows
// we just touched so the leaderboard shows nobody before the event starts.
const pg = require('pg');
const pool = new pg.Pool({ connectionString: prod.DATABASE_URL || prod.POSTGRES_URL, ssl: { rejectUnauthorized: false }, max: 2 });
const names = working.map((w) => w.name);
const cleared = await pool.query(
  "UPDATE progress SET flags='{}' WHERE team_id IN (SELECT id FROM teams WHERE name = ANY($1)) AND flags LIKE '%eventEntered%'",
  [names]
);
console.log('flags restored on', cleared.rowCount, 'team(s)');
await pool.end();

fs.writeFileSync('.pa-working-codes.txt', working.map((w) => `${w.name},${w.code}`).join('\n') + '\n');
console.log('list written to .pa-working-codes.txt');
