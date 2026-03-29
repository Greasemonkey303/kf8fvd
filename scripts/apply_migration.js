const crypto = require('crypto')
const fs = require('fs')
const path = require('path')
const mysql = require('mysql2/promise')

function loadEnvFile() {
  const envPath = path.join(process.cwd(), '.env.local')
  const env = {}
  if (!fs.existsSync(envPath)) return env

  const txt = fs.readFileSync(envPath, 'utf8')
  txt.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) return
    const idx = trimmed.indexOf('=')
    if (idx === -1) return
    const key = trimmed.slice(0, idx).trim()
    let val = trimmed.slice(idx + 1)
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }
    env[key] = val
  })

  return env
}

function checksumFor(sql) {
  return crypto.createHash('sha256').update(sql).digest('hex')
}

async function ensureSchemaMigrationsTable(conn) {
  await conn.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      file_name VARCHAR(255) NOT NULL,
      checksum CHAR(64) NOT NULL,
      source VARCHAR(64) NOT NULL DEFAULT 'apply_migration',
      notes TEXT NULL,
      applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_schema_migrations_file_name (file_name)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `)
}

async function main(){
  try {
    const args = process.argv.slice(2)
    const relPath = args[0] || 'migrations/2026_03_10_add_auth_tables.sql'
    const sqlFile = path.isAbsolute(relPath) ? relPath : path.join(process.cwd(), relPath)

    if (!fs.existsSync(sqlFile)) {
      console.error('Migration file not found:', sqlFile)
      process.exit(2)
    }

    const env = loadEnvFile()

    const host = env.DB_HOST || process.env.DB_HOST || 'localhost'
    const port = parseInt(env.DB_PORT || process.env.DB_PORT || '3306')
    const user = env.DB_USER || process.env.DB_USER
    const password = env.DB_PASSWORD || process.env.DB_PASSWORD
    const database = env.DB_NAME || process.env.DB_NAME

    if (!user || !database) {
      console.error('DB_USER or DB_NAME not set in .env.local or environment')
      process.exit(2)
    }

    const sql = fs.readFileSync(sqlFile, 'utf8')
    const fileName = path.basename(sqlFile)
    const checksum = checksumFor(sql)
    console.log('Connecting to DB', { host, port, user, database })
    const conn = await mysql.createConnection({ host, port, user, password, database, multipleStatements: true })
    await ensureSchemaMigrationsTable(conn)

    const [existingRows] = await conn.query('SELECT checksum FROM schema_migrations WHERE file_name = ? LIMIT 1', [fileName])
    const existing = Array.isArray(existingRows) && existingRows.length ? existingRows[0] : null
    if (existing && existing.checksum === checksum) {
      console.log('Migration already recorded, skipping:', fileName)
      await conn.end()
      process.exit(0)
    }
    if (existing && existing.checksum !== checksum) {
      console.error('Recorded migration checksum differs from file on disk:', fileName)
      await conn.end()
      process.exit(2)
    }

    console.log('Applying migration:', sqlFile)
    await conn.query(sql)
    await conn.query(
      'INSERT INTO schema_migrations (file_name, checksum, source) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE checksum = VALUES(checksum), source = VALUES(source), applied_at = CURRENT_TIMESTAMP',
      [fileName, checksum, 'apply_migration']
    )
    console.log('Migration applied successfully:', sqlFile)
    await conn.end()
    process.exit(0)
  } catch (err) {
    console.error('Migration failed:', err)
    process.exit(1)
  }
}

main()
