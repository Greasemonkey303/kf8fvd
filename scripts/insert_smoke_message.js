// inserts a smoke-test message into the messages table and copies the attachment into data/uploads
require('dotenv').config({ path: '.env.local' })
const fs = require('fs').promises
const path = require('path')
const mysql = require('mysql2/promise')

async function main() {
  const uploadDir = `${Date.now()}-smoke-${Math.random().toString(36).slice(2,8)}`
  const base = path.join(process.cwd(), 'data', 'uploads', uploadDir)
  await fs.mkdir(base, { recursive: true })
  const src = path.join(process.cwd(), 'data', 'smoke-attachment.txt')
  const dest = path.join(base, 'smoke-attachment.txt')
  await fs.copyFile(src, dest)

  const attachmentsMeta = [{ filename: 'smoke-attachment.txt', type: 'text/plain', dir: uploadDir }]

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
    const [result] = await pool.query('INSERT INTO messages (name, email, message, attachments, ip, user_agent) VALUES (?, ?, ?, ?, ?, ?)',
      ['Smoke Tester', 'smoke@example.com', 'This is an automated smoke test message', JSON.stringify(attachmentsMeta), '127.0.0.1', 'smoke-agent/1.0'])
    console.log('Inserted message id:', result.insertId)
    console.log('Upload dir:', uploadDir)
  } catch (e) {
    console.error('DB error', e)
    process.exit(2)
  } finally {
    await pool.end()
  }
}

main().catch(e=>{ console.error(e); process.exit(1) })
