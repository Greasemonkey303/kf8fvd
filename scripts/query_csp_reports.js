#!/usr/bin/env node
// Query recent CSP reports from the DB (useful when running staging with CSP_REPORT_ONLY=1)
const mysql = require('mysql2/promise')

async function main(){
  const host = process.env.DB_HOST || 'localhost'
  const port = process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306
  const user = process.env.DB_USER || 'root'
  const password = process.env.DB_PASSWORD || ''
  const database = process.env.DB_NAME || 'kf8fvd'

  const conn = await mysql.createConnection({ host, port, user, password, database })
  const [rows] = await conn.execute('SELECT id, document_uri, blocked_uri, violated_directive, user_agent, received_at FROM csp_reports ORDER BY id DESC LIMIT 50')
  console.table(rows)
  await conn.end()
}

main().catch(e=>{ console.error(e); process.exit(2) })
