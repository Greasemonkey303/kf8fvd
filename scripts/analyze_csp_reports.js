#!/usr/bin/env node
// Analyze CSP reports in the DB and summarize top violated directives and blocked URIs
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
  const [rows] = await conn.execute('SELECT violated_directive, blocked_uri, COUNT(*) as cnt FROM csp_reports GROUP BY violated_directive, blocked_uri ORDER BY cnt DESC LIMIT 100')
  if (!rows || rows.length === 0) {
    console.log('No CSP reports found')
    await conn.end()
    return
  }

  const dirMap = {}
  const uriMap = {}
  for (const r of rows) {
    const d = r.violated_directive || '<unknown>'
    const u = r.blocked_uri || '<inline or data>'
    dirMap[d] = (dirMap[d] || 0) + (r.cnt||0)
    uriMap[u] = (uriMap[u] || 0) + (r.cnt||0)
  }

  console.log('\nTop violated directives:')
  Object.entries(dirMap).sort((a,b)=>b[1]-a[1]).slice(0,20).forEach(([k,v])=>console.log(`${v}\t${k}`))

  console.log('\nTop blocked URIs:')
  Object.entries(uriMap).sort((a,b)=>b[1]-a[1]).slice(0,50).forEach(([k,v])=>console.log(`${v}\t${k}`))

  await conn.end()
}

main().catch(e=>{ console.error(e); process.exit(2) })
