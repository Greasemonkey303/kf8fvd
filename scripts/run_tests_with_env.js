const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const base = process.cwd();
const candidates = ['.env.local', 'env.local'];
let p = null;
for (const fname of candidates) {
  const cpPath = path.resolve(base, fname);
  if (fs.existsSync(cpPath)) { p = cpPath; break; }
}
if (!p) {
  console.error('No env file found (env.local or .env.local) in', base);
  process.exit(2);
}
const content = fs.readFileSync(p, 'utf8');
content.split(/\r?\n/).forEach(l => {
  const m = /^\s*([^#=]+)\s*=\s*(.*)$/.exec(l);
  if (!m) return;
  const k = m[1].trim();
  let v = m[2].trim();
  v = v.replace(/^['"]|['"]$/g, '');
  if (!process.env[k]) process.env[k] = v;
});

// For unit tests we prefer the in-memory fallbacks (avoid touching production DB).
// Clear DB env vars so tests run the in-memory codepaths unless explicitly overridden.
['DB_HOST','DB_PORT','DB_USER','DB_PASSWORD','DB_NAME','MYSQL_HOST','MYSQL_USER','MYSQL_PASSWORD','MYSQL_DATABASE'].forEach(k => { delete process.env[k] })
// Tell library code to avoid DB fallback during unit tests
process.env.DISABLE_DB_FALLBACK = '1'

try {
  console.log('Running tests with env from', p);
  cp.execSync('npx vitest run tests/unit', { stdio: 'inherit', shell: true });
  process.exit(0);
} catch (err) {
  console.error('tests failed:', err && err.message ? err.message : err);
  process.exit(err.status || 1);
}
