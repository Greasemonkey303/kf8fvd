#!/usr/bin/env node
// Clear all rows from csp_reports table (for local staging/testing only)
const fs = require('fs')
const path = require('path')
const mysql = require('mysql2/promise')

function loadDotEnv() {
  const envPath = path.join(process.cwd(), '.env.local')
  const env = {}
  if (!fs.existsSync(envPath)) return env
  const txt = fs.readFileSync(envPath, 'utf8')
  txt.split(/\r?\n/).forEach(line => {
    const t = line.trim()
    if (!t || t.startsWith('#')) return
    const idx = t.indexOf('=')
    if (idx === -1) return
    const key = t.slice(0, idx).trim()
    let val = t.slice(idx+1)
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1,-1)
    env[key] = val
  })
  return env
}

async function main(){
  const env = loadDotEnv()
  const host = env.DB_HOST || process.env.DB_HOST || 'localhost'
  const port = env.DB_PORT ? Number(env.DB_PORT) : (process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306)
  const user = env.DB_USER || process.env.DB_USER || 'root'
  const password = env.DB_PASSWORD || process.env.DB_PASSWORD || ''
  const database = env.DB_NAME || process.env.DB_NAME || 'kf8fvd'

  const conn = await mysql.createConnection({ host, port, user, password, database })
  try {
    await conn.execute('DELETE FROM csp_reports')
    console.log('csp_reports cleared')
  } catch (err) {
    console.error('Error clearing csp_reports:', err.message || err)
    process.exitCode = 2
  } finally {
    await conn.end()
  }
}

main()
