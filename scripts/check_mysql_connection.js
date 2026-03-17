#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

async function loadEnvFile() {
  const base = process.cwd();
  const candidates = ['.env.local', 'env.local', '.env'];
  for (const fname of candidates) {
    const cp = path.resolve(base, fname);
    if (fs.existsSync(cp)) {
      const content = fs.readFileSync(cp, 'utf8');
      const out = {};
      content.split(/\r?\n/).forEach(l => {
        const m = /^\s*([^#=]+)\s*=\s*(.*)$/.exec(l);
        if (!m) return;
        const k = m[1].trim();
        let v = m[2].trim();
        v = v.replace(/^['\"]|['\"]$/g, '');
        out[k] = v;
      });
      return out;
    }
  }
  return {};
}

(async function main(){
  try {
    const env = await loadEnvFile();
    const host = process.env.DB_HOST || env.DB_HOST || '127.0.0.1';
    const port = Number(process.env.DB_PORT || env.DB_PORT || 3306);
    const user = process.env.DB_USER || env.DB_USER || 'root';
    const password = process.env.DB_PASSWORD || env.DB_PASSWORD || '';
    const database = process.env.DB_NAME || env.DB_NAME || '';

    console.log(`Testing MySQL connection to ${host}:${port} as ${user} (db=${database || '<none>'})`);

    const mysql = require('mysql2/promise');
    const pool = mysql.createPool({ host, port, user, password, database, waitForConnections: true, connectionLimit: 1 });
    const conn = await pool.getConnection();
    const [rows] = await conn.query('SELECT VERSION() as version, DATABASE() as database_now, 1+1 as sum');
    conn.release();
    await pool.end();

    console.log('Connection OK:');
    console.log('  version:', rows && rows[0] && rows[0].version);
    console.log('  selected database:', rows && rows[0] && rows[0].database_now);
    console.log('  test sum:', rows && rows[0] && rows[0].sum);
    console.log('\nConnection details (from .env.local or process.env):');
    console.log(`  host=${host}`);
    console.log(`  port=${port}`);
    console.log(`  user=${user}`);
    console.log(`  password=${password}`);
    console.log(`  database=${database}`);
    process.exit(0);
  } catch (e) {
    console.error('Connection failed:', e && e.message ? e.message : e);
    process.exit(2);
  }
})();
