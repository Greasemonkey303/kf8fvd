const fs = require('fs');
const path = require('path');

function loadEnv(file = '.env.local') {
  try {
    const p = path.resolve(process.cwd(), file);
    const s = fs.readFileSync(p, 'utf8');
    s.split(/\r?\n/).forEach(line => {
      const m = line.match(/^\s*([^#=]+?)\s*=\s*(.*)\s*$/);
      if (m) {
        const key = m[1].trim();
        let val = m[2].trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        if (!process.env[key]) process.env[key] = val;
      }
    });
  } catch (e) {
    // ignore
  }
}

loadEnv('.env.local');

(async () => {
  try {
    const mysql = require('mysql2/promise');
    const host = process.env.DB_HOST || 'localhost';
    const port = process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306;
    const user = process.env.DB_USER || 'root';
    const password = process.env.DB_PASSWORD || '';
    const database = process.env.DB_NAME || 'kf8fvd';
    const emailToCheck = process.argv[2] || process.env.CHECK_EMAIL || 'zach@kf8fvd.com';

    console.log('Connecting to MySQL %s@%s:%s/%s', user, host, port, database);
    const conn = await mysql.createConnection({ host, port, user, password, database });

    async function safeQuery(q, params) {
      try {
        const [rows] = await conn.execute(q, params || []);
        return rows;
      } catch (e) {
        console.warn('Query failed:', q, e && e.message ? e.message : e);
        return null;
      }
    }

    console.log('\n=== auth_locks (most recent) ===');
    const locks = await safeQuery('SELECT * FROM auth_locks ORDER BY locked_until DESC LIMIT 50');
    console.log(locks && locks.length ? JSON.stringify(locks, null, 2) : '<no rows or table missing>');

    console.log('\n=== login_attempts (most recent) ===');
    const attempts = await safeQuery('SELECT * FROM login_attempts ORDER BY created_at DESC LIMIT 50');
    console.log(attempts && attempts.length ? JSON.stringify(attempts, null, 2) : '<no rows or table missing>');

    console.log('\n=== two_factor_codes for', emailToCheck, '===');
    const codes = await safeQuery('SELECT * FROM two_factor_codes WHERE email = ? ORDER BY created_at DESC LIMIT 20', [emailToCheck]);
    console.log(codes && codes.length ? JSON.stringify(codes, null, 2) : '<no rows or table missing for that email>');

    await conn.end();
    process.exit(0);
  } catch (e) {
    console.error('ERR', e && e.stack ? e.stack : e);
    process.exit(2);
  }
})();
