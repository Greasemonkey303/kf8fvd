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
  } catch {}
}
loadEnv('.env.local');

const mysql = require('mysql2/promise');
const RedisMod = require('ioredis');

async function openDb() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'kf8fvd',
  });
  return conn;
}

function now() { return new Date().toISOString() }

(async () => {
  console.log(now(), 'watch_auth_events starting...');
  let db;
  try { db = await openDb(); console.log(now(), 'Connected to MySQL') } catch (e) { console.error(now(), 'MySQL connect failed', e && e.message); process.exit(2) }

  let redis = null;
  try {
    const url = process.env.REDIS_URL || '';
    if (url) { redis = new RedisMod(url); await redis.ping(); console.log(now(), 'Connected to Redis at', url) }
  } catch (e) { console.warn(now(), 'Redis not available:', e && e.message); redis = null }

  // get current max ids
  let lastTwoFa = 0, lastAttempt = 0, lastLock = 0;
  try { const [r] = await db.execute('SELECT COALESCE(MAX(id),0) as mx FROM two_factor_codes'); lastTwoFa = r[0].mx || 0 } catch { console.log(now(), 'two_factor_codes table missing or inaccessible') }
  try { const [r] = await db.execute('SELECT COALESCE(MAX(id),0) as mx FROM login_attempts'); lastAttempt = r[0].mx || 0 } catch { console.log(now(), 'login_attempts table missing or inaccessible') }
  try { const [r] = await db.execute('SELECT COALESCE(MAX(id),0) as mx FROM auth_locks'); lastLock = r[0].mx || 0 } catch { console.log(now(), 'auth_locks table missing or inaccessible') }

  console.log(now(), 'initial ids', { lastTwoFa, lastAttempt, lastLock });

  process.on('SIGINT', async () => {
    console.log(now(), 'shutting down...')
    try {
      if (redis) redis.quit()
      if (db) db.end()
    } catch {}
    process.exit(0)
  })

  while (true) {
    try {
      // two_factor_codes
      try {
        const [rows] = await db.execute('SELECT * FROM two_factor_codes WHERE id > ? ORDER BY id ASC', [lastTwoFa]);
        if (rows && rows.length) {
          for (const r of rows) {
            console.log(now(), 'NEW two_factor_codes:', JSON.stringify(r));
            lastTwoFa = Math.max(lastTwoFa, r.id || 0);
          }
        }
      } catch {}

      // login_attempts
      try {
        const [rows2] = await db.execute('SELECT * FROM login_attempts WHERE id > ? ORDER BY id ASC', [lastAttempt]);
        if (rows2 && rows2.length) {
          for (const r of rows2) {
            console.log(now(), 'NEW login_attempts:', JSON.stringify(r));
            lastAttempt = Math.max(lastAttempt, r.id || 0);
          }
        }
      } catch {}

      // auth_locks
      try {
        const [rows3] = await db.execute('SELECT * FROM auth_locks WHERE id > ? ORDER BY id ASC', [lastLock]);
        if (rows3 && rows3.length) {
          for (const r of rows3) {
            console.log(now(), 'NEW auth_locks:', JSON.stringify(r));
            lastLock = Math.max(lastLock, r.id || 0);
          }
        }
      } catch {}

      // Redis keys
      if (redis) {
        try {
          const keys = await redis.keys('rl:*');
          if (keys && keys.length) {
            for (const k of keys) {
              const v = await redis.get(k);
              const ttl = await redis.pttl(k);
              console.log(now(), 'REDIS', k, '=>', v, 'PTTL=', ttl);
            }
          }
        } catch (e) { console.warn(now(), 'redis poll err', e && e.message) }
      }
    } catch (e) { console.error(now(), 'watch loop error', e && e.message) }
    await new Promise(r => setTimeout(r, 2000));
  }

})();
