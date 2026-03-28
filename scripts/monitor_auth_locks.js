#!/usr/bin/env node
// Monitor script: prints counts for auth_locks, login_attempts, and Redis rl:* keys
const fs = require('fs')
const path = require('path')

// Load .env.local if present
try{
  const p = path.resolve(process.cwd(), '.env.local')
  if (fs.existsSync(p)) {
    const s = fs.readFileSync(p,'utf8')
    s.split(/\r?\n/).forEach(line=>{
      const t=line.trim(); if(!t||t.startsWith('#')) return
      const idx=t.indexOf('='); if(idx===-1) return
      const k=t.slice(0,idx).trim(); let v=t.slice(idx+1).trim()
      if ((v.startsWith('"')&&v.endsWith('"'))||(v.startsWith("'")&&v.endsWith("'"))) v=v.slice(1,-1)
      if(!process.env[k]) process.env[k]=v
    })
  }
}catch{}

(async()=>{
  try{
    const mysql = require('mysql2/promise')
    const Redis = require('ioredis')
    const db = await mysql.createConnection({ host: process.env.DB_HOST||'localhost', port: process.env.DB_PORT?Number(process.env.DB_PORT):3306, user: process.env.DB_USER||'root', password: process.env.DB_PASSWORD||'', database: process.env.DB_NAME||'kf8fvd' })
    const redisUrl = process.env.REDIS_URL || ''
    let redis = null
    if (redisUrl) {
      try { redis = new Redis(redisUrl) } catch (e) { console.warn('redis connect failed', e) }
    }

    const [[locksR]] = await db.execute('SELECT COUNT(*) as cnt FROM auth_locks')
    const [[attR]] = await db.execute('SELECT COUNT(*) as cnt FROM login_attempts')
    const locks = locksR && locksR.cnt ? locksR.cnt : 0
    const attempts = attR && attR.cnt ? attR.cnt : 0

    let rlKeys = 0
    if (redis) {
      // count rl:* keys via SCAN
      let cursor = '0'
      do {
        const res = await redis.scan(cursor, 'MATCH', 'rl:*', 'COUNT', 100)
        cursor = res[0]
        rlKeys += (res[1] && res[1].length) ? res[1].length : 0
      } while (cursor !== '0')
    }

    console.log(JSON.stringify({ auth_locks: locks, login_attempts: attempts, redis_rl_keys: rlKeys, timestamp: new Date().toISOString() }, null, 2))

    if (redis) redis.disconnect()
    await db.end()
    process.exit(0)
  }catch(err){
    console.error('monitor failed', err)
    process.exit(2)
  }
})()
