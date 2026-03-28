#!/usr/bin/env node
// Delete admin_actions rows older than configured retention (days)
const fs = require('fs')
const path = require('path')

// Inline, robust env loader (avoids collisions with other code)
try {
  const envPath = path.resolve(process.cwd(), '.env.local')
  if (fs.existsSync(envPath)) {
    const txt = fs.readFileSync(envPath, 'utf8')
    txt.split(/\r?\n/).forEach(line => {
      const t = line.trim()
      if (!t || t.startsWith('#')) return
      const idx = t.indexOf('=')
      if (idx === -1) return
      const key = t.slice(0, idx).trim()
      let val = t.slice(idx+1).trim()
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1,-1)
      if (!process.env[key]) process.env[key] = val
    })
  }
} catch {
  // ignore
}

(async function main(){
  try {
    const mysql = require('mysql2/promise')
    const host = process.env.DB_HOST || 'localhost'
    const port = process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306
    const user = process.env.DB_USER || 'root'
    const password = process.env.DB_PASSWORD || ''
    const database = process.env.DB_NAME || 'kf8fvd'
    const days = Number(process.argv[2] || process.env.ADMIN_ACTIONS_RETENTION_DAYS || 365)

    console.log('Connecting to DB', { host, port, user, database })
    const conn = await mysql.createConnection({ host, port, user, password, database })
    const sql = 'DELETE FROM admin_actions WHERE created_at < DATE_SUB(NOW(), INTERVAL ? DAY)'
    const [res] = await conn.execute(sql, [days])
    console.log('Deleted rows:', res && res.affectedRows ? res.affectedRows : 0)
    await conn.end()
    process.exit(0)
  } catch (err) {
    console.error('cleanup_admin_actions failed:', err)
    process.exit(2)
  }
})()
