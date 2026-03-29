// inserts a smoke-test message into the messages table and stores the attachment in MinIO
require('dotenv').config({ path: '.env.local' })
const fs = require('fs').promises
const path = require('path')
const Minio = require('minio')
const mysql = require('mysql2/promise')

async function main() {
  const uploadDir = `${Date.now()}-smoke-${Math.random().toString(36).slice(2,8)}`
  const src = path.join(process.cwd(), 'data', 'smoke-attachment.txt')
  const body = await fs.readFile(src)
  const key = `messages/${uploadDir}/smoke-attachment.txt`
  const bucket = process.env.NEXT_PUBLIC_S3_BUCKET
  if (!bucket) throw new Error('NEXT_PUBLIC_S3_BUCKET is required')
  const client = new Minio.Client({
    endPoint: process.env.MINIO_HOST || process.env.MINIO_ENDPOINT || process.env.AWS_S3_ENDPOINT || '127.0.0.1',
    port: Number(process.env.MINIO_PORT || process.env.MINIO_HTTP_PORT || 9000),
    useSSL: process.env.MINIO_USE_SSL === 'true' || process.env.MINIO_USE_SSL === '1',
    accessKey: process.env.MINIO_ACCESS_KEY || process.env.AWS_ACCESS_KEY_ID,
    secretKey: process.env.MINIO_SECRET_KEY || process.env.AWS_SECRET_ACCESS_KEY,
  })
  await client.putObject(bucket, key, body, body.length, { 'Content-Type': 'text/plain' })

  const attachmentsMeta = [{ filename: 'smoke-attachment.txt', type: 'text/plain', key, storage: 'minio' }]

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
    const sanitized = String('This is an automated smoke test message').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;')
    const [result] = await pool.query('INSERT INTO messages (name, email, message, message_sanitized, attachments, ip, user_agent) VALUES (?, ?, ?, ?, ?, ?, ?)',
      ['Smoke Tester', 'smoke@example.com', 'This is an automated smoke test message', sanitized, JSON.stringify(attachmentsMeta), '127.0.0.1', 'smoke-agent/1.0'])
    console.log('Inserted message id:', result.insertId)
    console.log('Attachment key:', key)
  } catch (e) {
    console.error('DB error', e)
    process.exit(2)
  } finally {
    await pool.end()
  }
}

main().catch(e=>{ console.error(e); process.exit(1) })
