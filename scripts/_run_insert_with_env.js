const fs = require('fs');
const path = require('path');
const base = process.cwd();
const candidates = ['env.local', '.env.local'];
let p = null;
for (const fname of candidates) {
  const cp = path.resolve(base, fname);
  if (fs.existsSync(cp)) { p = cp; break; }
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
  process.env[k] = v;
});

// Run the existing script (it should use process.env for DB creds)
try {
  require(path.resolve(process.cwd(), 'scripts', 'insert_and_show_admin_actions.js'));
} catch (err) {
  console.error('script error:', err && err.message ? err.message : err);
  process.exit(3);
}
