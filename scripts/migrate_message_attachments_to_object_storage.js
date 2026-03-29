#!/usr/bin/env node
require('dotenv').config({ path: '.env.local' })
const fs = require('fs')
const path = require('path')
const mysql = require('mysql2/promise')
const Minio = require('minio')

function parseArgs() {
  return {
    apply: process.argv.includes('--apply'),
    deleteLocal: process.argv.includes('--delete-local'),
    json: process.argv.includes('--json'),
  }
}

function createMinioClient() {
  return new Minio.Client({
    endPoint: process.env.MINIO_HOST || process.env.MINIO_ENDPOINT || process.env.AWS_S3_ENDPOINT || '127.0.0.1',
    port: Number(process.env.MINIO_PORT || process.env.MINIO_HTTP_PORT || 9000),
    useSSL: process.env.MINIO_USE_SSL === 'true' || process.env.MINIO_USE_SSL === '1',
    accessKey: process.env.MINIO_ACCESS_KEY || process.env.AWS_ACCESS_KEY_ID,
    secretKey: process.env.MINIO_SECRET_KEY || process.env.AWS_SECRET_ACCESS_KEY,
  })
}

async function main() {
  const args = parseArgs()
  const bucket = process.env.NEXT_PUBLIC_S3_BUCKET
  if (!bucket) throw new Error('NEXT_PUBLIC_S3_BUCKET is required')

  const db = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'kf8fvd',
  })
  const client = createMinioClient()
  const report = { scannedMessages: 0, migratedAttachments: 0, updatedMessages: 0, missingFiles: [], unchangedMessages: [], dryRun: !args.apply }

  try {
    const [rows] = await db.execute('SELECT id, attachments FROM messages WHERE attachments IS NOT NULL AND attachments <> ""')
    for (const row of rows) {
      report.scannedMessages += 1
      let attachments
      try {
        attachments = typeof row.attachments === 'string' ? JSON.parse(row.attachments || '[]') : row.attachments
      } catch {
        continue
      }
      if (!Array.isArray(attachments) || !attachments.length) continue

      let changed = false
      const nextAttachments = []
      for (const attachment of attachments) {
        if (!attachment || typeof attachment !== 'object') {
          nextAttachments.push(attachment)
          continue
        }
        if (attachment.key) {
          nextAttachments.push(attachment)
          continue
        }
        if (!attachment.dir || !attachment.filename) {
          nextAttachments.push(attachment)
          continue
        }

        const safeFilename = path.basename(String(attachment.filename))
        const localPath = path.join(process.cwd(), 'data', 'uploads', String(attachment.dir), safeFilename)
        if (!fs.existsSync(localPath)) {
          report.missingFiles.push({ messageId: row.id, path: localPath })
          nextAttachments.push(attachment)
          continue
        }

        const key = `messages/${attachment.dir}/${safeFilename}`
        if (args.apply) {
          const body = await fs.promises.readFile(localPath)
          await client.putObject(bucket, key, body, body.length, { 'Content-Type': attachment.type || 'application/octet-stream' })
          if (args.deleteLocal) await fs.promises.unlink(localPath)
        }

        nextAttachments.push({ filename: safeFilename, type: attachment.type || 'application/octet-stream', key, storage: 'minio' })
        report.migratedAttachments += 1
        changed = true
      }

      if (!changed) {
        report.unchangedMessages.push(row.id)
        continue
      }

      if (args.apply) {
        await db.execute('UPDATE messages SET attachments = ? WHERE id = ?', [JSON.stringify(nextAttachments), row.id])
      }
      report.updatedMessages += 1
    }
  } finally {
    await db.end()
  }

  if (args.json) console.log(JSON.stringify(report, null, 2))
  else {
    console.log(`scannedMessages=${report.scannedMessages}`)
    console.log(`migratedAttachments=${report.migratedAttachments}`)
    console.log(`updatedMessages=${report.updatedMessages}`)
    console.log(`missingFiles=${report.missingFiles.length}`)
    console.log(`dryRun=${report.dryRun}`)
  }
}

main().catch((error) => {
  console.error('message attachment migration failed', error)
  process.exit(2)
})