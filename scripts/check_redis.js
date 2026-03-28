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
  } catch {
    // ignore
  }
}

loadEnv('.env.local');

(async () => {
  try {
    console.log('ENV_REDIS_URL=' + (process.env.REDIS_URL || '<none>'));
    const Redis = require('ioredis');
    const r = new Redis(process.env.REDIS_URL);
    r.on('error', e => console.error('REDIS_ERR', e && e.stack ? e.stack : e));
    await r.ping();
    console.log('PING_OK');
    const keys = await r.keys('rl:*');
    console.log('RL_KEYS_COUNT=' + keys.length);
    for (const k of keys) {
      const v = await r.get(k);
      const ttl = await r.pttl(k);
      console.log(`${k} = ${v === null ? '<null>' : v} PTTL=${ttl}`);
    }
    await r.quit();
    process.exit(0);
  } catch (e) {
    console.error('ERR', e && e.stack ? e.stack : e);
    process.exit(2);
  }
})();
