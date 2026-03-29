#!/usr/bin/env node
const crypto = require('crypto')
const fs = require('fs')
const path = require('path')
const mysql = require('mysql2/promise')

function loadEnvFile() {
  const envPath = path.resolve(process.cwd(), '.env.local')
  const env = {}
  if (!fs.existsSync(envPath)) return env

  const content = fs.readFileSync(envPath, 'utf8')
  content.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) return
    const idx = trimmed.indexOf('=')
    if (idx === -1) return
    const key = trimmed.slice(0, idx).trim()
    let value = trimmed.slice(idx + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    env[key] = value
  })

  return env
}

function parseArgs(argv) {
  return {
    json: argv.includes('--json'),
    bootstrapExisting: argv.includes('--bootstrap-existing'),
    help: argv.includes('--help') || argv.includes('-h'),
  }
}

function checksumFor(content) {
  return crypto.createHash('sha256').update(content).digest('hex')
}

function listMigrationFiles() {
  const migrationsDir = path.resolve(process.cwd(), 'migrations')
  return fs.readdirSync(migrationsDir)
    .filter((fileName) => fileName.toLowerCase().endsWith('.sql'))
    .sort()
    .map((fileName) => {
      const absolutePath = path.join(migrationsDir, fileName)
      const content = fs.readFileSync(absolutePath, 'utf8')
      return {
        fileName,
        absolutePath,
        checksum: checksumFor(content),
      }
    })
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

function printUsage() {
  console.log([
    'Usage: node scripts/check_pending_migrations.js [options]',
    '',
    'Options:',
    '  --json                Print the report as JSON.',
    '  --bootstrap-existing  Record currently present migration files as applied without executing them.',
    '  --help                Show this message.',
  ].join('\n'))
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  if (options.help) {
    printUsage()
    return
  }

  const env = loadEnvFile()
  const host = env.DB_HOST || process.env.DB_HOST || 'localhost'
  const port = Number(env.DB_PORT || process.env.DB_PORT || '3306')
  const user = env.DB_USER || process.env.DB_USER
  const password = env.DB_PASSWORD || process.env.DB_PASSWORD
  const database = env.DB_NAME || process.env.DB_NAME

  if (!user || !database) {
    console.error('DB_USER or DB_NAME not set in .env.local or environment')
    process.exit(2)
  }

  const files = listMigrationFiles()
  const conn = await mysql.createConnection({ host, port, user, password, database, multipleStatements: true })

  try {
    await ensureSchemaMigrationsTable(conn)
    const [appliedRows] = await conn.query('SELECT file_name, checksum, source, applied_at FROM schema_migrations ORDER BY file_name ASC')
    const appliedByName = new Map((Array.isArray(appliedRows) ? appliedRows : []).map((row) => [row.file_name, row]))

    const pending = []
    const checksumMismatches = []
    for (const file of files) {
      const recorded = appliedByName.get(file.fileName)
      if (!recorded) {
        pending.push(file)
        continue
      }
      if (recorded.checksum !== file.checksum) {
        checksumMismatches.push({
          fileName: file.fileName,
          recordedChecksum: recorded.checksum,
          currentChecksum: file.checksum,
        })
      }
    }

    const unknownApplied = Array.from(appliedByName.keys()).filter((fileName) => !files.some((file) => file.fileName === fileName))
    const bootstrapped = []
    if (options.bootstrapExisting && pending.length && checksumMismatches.length === 0) {
      for (const file of pending) {
        await conn.query(
          'INSERT INTO schema_migrations (file_name, checksum, source, notes) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE checksum = VALUES(checksum), source = VALUES(source), notes = VALUES(notes), applied_at = CURRENT_TIMESTAMP',
          [file.fileName, file.checksum, 'bootstrap_existing', 'Recorded without executing SQL; use only after validating target schema state.']
        )
        bootstrapped.push(file.fileName)
      }
    }

    const report = {
      database,
      totalMigrationFiles: files.length,
      pendingCount: options.bootstrapExisting ? Math.max(0, pending.length - bootstrapped.length) : pending.length,
      checksumMismatchCount: checksumMismatches.length,
      unknownAppliedCount: unknownApplied.length,
      pending: pending.map((file) => file.fileName),
      checksumMismatches,
      unknownApplied,
      bootstrapped,
    }

    if (options.json) {
      console.log(JSON.stringify(report, null, 2))
    } else {
      console.log(`database=${report.database}`)
      console.log(`totalMigrationFiles=${report.totalMigrationFiles}`)
      console.log(`pendingCount=${report.pendingCount}`)
      console.log(`checksumMismatchCount=${report.checksumMismatchCount}`)
      console.log(`unknownAppliedCount=${report.unknownAppliedCount}`)
      if (bootstrapped.length) console.log(`bootstrapped=${bootstrapped.join(',')}`)
      if (report.pending.length) console.log(`pending=${report.pending.join(',')}`)
      if (report.checksumMismatches.length) console.log(`checksumMismatches=${JSON.stringify(report.checksumMismatches)}`)
      if (report.unknownApplied.length) console.log(`unknownApplied=${report.unknownApplied.join(',')}`)
    }

    if (checksumMismatches.length) process.exit(2)
    if (options.bootstrapExisting) process.exit(0)
    process.exit(report.pendingCount > 0 ? 1 : 0)
  } finally {
    await conn.end()
  }
}

main().catch((error) => {
  console.error('migration check failed', error)
  process.exit(2)
})