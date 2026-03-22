#!/usr/bin/env node
// Backfill messages.message_sanitized using DOMPurify + jsdom
// Creates a JSON backup in ./data/messages_backup_<ts>.json before updating.

require('dotenv').config({ path: '.env.local' })
const fs = require('fs').promises
const path = require('path')
const mysql = require('mysql2/promise')
const { JSDOM } = require('jsdom')
const createDOMPurify = require('dompurify')

async function main() {
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
    const [allRows] = await pool.query('SELECT * FROM messages')
    const ts = new Date().toISOString().replace(/[:.]/g, '-')
    const outDir = path.join(process.cwd(), 'data', 'backups')
    await fs.mkdir(outDir, { recursive: true })
    const backupPath = path.join(outDir, `messages_backup_${ts}.json`)
    await fs.writeFile(backupPath, JSON.stringify(allRows, null, 2), 'utf8')
    console.log('Wrote backup to', backupPath)

    // Setup DOMPurify
    const window = new JSDOM('').window
    const DOMPurify = createDOMPurify(window)
    if (DOMPurify && typeof DOMPurify.setConfig === 'function') DOMPurify.setConfig({ FORBID_TAGS: ['script', 'style'] })

    // Process rows that are missing sanitized field
    const [rows] = await pool.query('SELECT id, message, message_sanitized FROM messages WHERE message_sanitized IS NULL OR message_sanitized = ""')
    console.log('Found', rows.length, 'rows to sanitize')
    for (const r of rows) {
      const raw = r.message || ''
      // allow only a small set of tags for messages
      const clean = DOMPurify.sanitize(String(raw), { ALLOWED_TAGS: ['b','i','em','strong','a','br','p','ul','ol','li'], ALLOWED_ATTR: ['href', 'target', 'rel'] })
      await pool.query('UPDATE messages SET message_sanitized = ? WHERE id = ?', [clean, r.id])
      console.log('Updated id', r.id)
    }

    console.log('Backfill complete')
  } catch (e) {
    console.error('Backfill failed', e)
    process.exitCode = 2
  } finally {
    try { await pool.end() } catch {}
  }
}

main().catch(e=>{ console.error(e); process.exit(1) })
