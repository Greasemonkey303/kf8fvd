const fs = require('fs')
const path = require('path')
const mysql = require('mysql2/promise')

function loadEnvFile() {
  const candidates = ['.env.local', 'env.local']
  for (const name of candidates) {
    const filePath = path.resolve(process.cwd(), name)
    if (!fs.existsSync(filePath)) continue
    const content = fs.readFileSync(filePath, 'utf8')
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const separator = trimmed.indexOf('=')
      if (separator === -1) continue
      const key = trimmed.slice(0, separator).trim()
      let value = trimmed.slice(separator + 1).trim()
      value = value.replace(/^['"]|['"]$/g, '')
      if (!process.env[key]) process.env[key] = value
    }
    return filePath
  }
  return null
}

async function ensureTable(conn) {
  await conn.query(`
    CREATE TABLE IF NOT EXISTS maintenance_runs (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      task_name VARCHAR(120) NOT NULL,
      status ENUM('ok', 'warning', 'failed') NOT NULL,
      command_text VARCHAR(255) NULL,
      summary TEXT NULL,
      error_text TEXT NULL,
      meta_json JSON NULL,
      runtime_ms INT UNSIGNED NULL,
      started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      finished_at TIMESTAMP NULL DEFAULT NULL,
      KEY idx_maintenance_runs_task_finished (task_name, finished_at),
      KEY idx_maintenance_runs_status_finished (status, finished_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `)
}

async function openConnection() {
  loadEnvFile()
  if (!process.env.DB_USER || !process.env.DB_NAME) return null
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || '3306'),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined,
  })
  await ensureTable(conn)
  return conn
}

async function insertRunRecord(conn, record) {
  const [result] = await conn.execute(
    'INSERT INTO maintenance_runs (task_name, status, command_text, summary, error_text, meta_json, runtime_ms, started_at, finished_at) VALUES (?, ?, ?, ?, ?, ?, ?, FROM_UNIXTIME(?/1000), FROM_UNIXTIME(?/1000))',
    [
      record.taskName,
      record.status,
      record.commandText || null,
      record.summary || null,
      record.errorText || null,
      record.metaJson ? JSON.stringify(record.metaJson) : null,
      record.runtimeMs || null,
      record.startedAt,
      record.finishedAt,
    ]
  )
  return result && result.insertId ? result.insertId : null
}

async function recordMaintenanceRun(taskName, options) {
  let conn = null
  try {
    conn = await openConnection()
    if (!conn) return null
    return await insertRunRecord(conn, { taskName, ...options })
  } catch {
    return null
  } finally {
    if (conn) {
      try { await conn.end() } catch {}
    }
  }
}

async function runWithMaintenanceRecord(taskName, meta, fn) {
  const startedAt = Date.now()
  try {
    const result = await fn()
    const finishedAt = Date.now()
    const resultStatus = result && result.status === 'failed'
      ? 'failed'
      : result && result.status === 'warning'
        ? 'warning'
        : 'ok'
    await recordMaintenanceRun(taskName, {
      status: resultStatus,
      commandText: meta && meta.commandText ? meta.commandText : null,
      summary: result && result.summary ? result.summary : null,
      metaJson: { ...(meta || {}), ...(result && result.meta ? result.meta : {}) },
      runtimeMs: finishedAt - startedAt,
      startedAt,
      finishedAt,
    })
    return result
  } catch (error) {
    const finishedAt = Date.now()
    await recordMaintenanceRun(taskName, {
      status: 'failed',
      commandText: meta && meta.commandText ? meta.commandText : null,
      summary: meta && meta.summary ? meta.summary : null,
      errorText: error instanceof Error ? error.message : String(error),
      metaJson: meta || null,
      runtimeMs: finishedAt - startedAt,
      startedAt,
      finishedAt,
    })
    throw error
  }
}

module.exports = {
  recordMaintenanceRun,
  runWithMaintenanceRecord,
}