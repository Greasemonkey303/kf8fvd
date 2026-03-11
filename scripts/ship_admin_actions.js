#!/usr/bin/env node
// Poll `admin_actions` table and POST new rows to a SIEM endpoint.
// Configure SIEM_ENDPOINT and SIEM_API_KEY in environment variables.
const fs = require('fs')
const path = require('path')
const mysql = require('mysql2/promise')

const stateFile = path.resolve(process.cwd(), '.shipper_state.json')
function loadState(){
  try { return JSON.parse(fs.readFileSync(stateFile,'utf8')) } catch(e){ return { lastId: 0 } }
}
function saveState(state){ fs.writeFileSync(stateFile, JSON.stringify(state)) }

async function main(){
  const siem = process.env.SIEM_ENDPOINT
  const apiKey = process.env.SIEM_API_KEY
  if (!siem) { console.error('SIEM_ENDPOINT not set'); process.exit(2) }

  const host = process.env.DB_HOST || 'localhost'
  const port = process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306
  const user = process.env.DB_USER || 'root'
  const password = process.env.DB_PASSWORD || ''
  const database = process.env.DB_NAME || 'kf8fvd'

  const conn = await mysql.createConnection({ host, port, user, password, database })
  let state = loadState()
  console.log('Starting admin_actions shipper. LastId:', state.lastId)

  while(true){
    try {
      const [rows] = await conn.execute('SELECT * FROM admin_actions WHERE id > ? ORDER BY id ASC LIMIT 100', [state.lastId])
      for (const r of rows) {
        // send to SIEM
        try {
          const payload = { id: r.id, admin_user_id: r.admin_user_id, action: r.action, target_key: r.target_key, details: r.details, created_at: r.created_at }
          await fetch(siem, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': apiKey ? `Bearer ${apiKey}` : '' }, body: JSON.stringify(payload) })
          state.lastId = r.id
          saveState(state)
          console.log('Shipped admin_action', r.id)
        } catch (e) {
          console.warn('Failed to ship', r.id, e && e.message ? e.message : e)
          // don't advance lastId; retry later
        }
      }
    } catch (e){
      console.warn('DB query failed', e && e.message ? e.message : e)
    }
    // sleep
    await new Promise(r=>setTimeout(r, Number(process.env.SHIPPER_POLL_MS || 30000)))
  }
}

main().catch(e=>{ console.error('shipper error', e); process.exit(2) })
