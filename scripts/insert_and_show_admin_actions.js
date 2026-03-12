#!/usr/bin/env node
const mysql = require('mysql2/promise')

async function main(){
  const host = process.env.DB_HOST || 'localhost'
  const port = process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306
  const user = process.env.DB_USER || 'root'
  const password = process.env.DB_PASSWORD || ''
  const database = process.env.DB_NAME || 'kf8fvd'

  const conn = await mysql.createConnection({ host, port, user, password, database })
  try {
    const metaObj = { smoke: true, ts: new Date().toISOString() }
    const metaStr = JSON.stringify(metaObj)
    const [res] = await conn.execute(
      'INSERT INTO admin_actions (admin_user_id, actor, actor_type, action, target_key, details, reason, ip, meta) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [null, 'dev', 'dev', 'smoke_test', 'smoke_key', 'Smoke test insert from script', null, '127.0.0.1', metaStr]
    )
    const insertId = res && (res.insertId || (res[0] && res[0].insertId))
    console.log('Inserted admin_actions id:', insertId)

    const [rows] = await conn.execute('SELECT id, admin_user_id, actor, actor_type, action, target_key, details, reason, ip, meta, created_at FROM admin_actions ORDER BY created_at DESC LIMIT 10')
    console.log('Recent admin_actions rows:')
    console.table(rows)
  } finally {
    await conn.end()
  }
}

main().catch(e => { console.error('error:', e && e.message ? e.message : e); process.exit(1) })
