require('dotenv').config({ path: '.env.local' })
const mysql = require('mysql2/promise')

;(async () => {
  const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT ? parseInt(process.env.DB_PORT) : 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 5,
    timezone: 'Z'
  })
  try {
    const [rows] = await pool.query('SELECT id, name, email, message, message_sanitized, attachments, ip, user_agent, created_at, is_read FROM messages ORDER BY id DESC LIMIT 1')
    console.log(JSON.stringify(rows, null, 2))
  } catch (e) {
    console.error('DB error', e)
    process.exit(2)
  } finally {
    await pool.end()
  }
})().catch(e=>{ console.error(e); process.exit(1) })
