const fs = require('fs')
const path = require('path')
const mysql = require('mysql2/promise')

async function loadEnv() {
  const envPath = path.join(process.cwd(), '.env.local')
  let env = {}
  if (fs.existsSync(envPath)){
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
  }
  return env
}

function encodeKey(k) { return encodeURIComponent(k) }

async function main(){
  try {
    const args = process.argv.slice(2)
    const key = args[0] || process.env.KEY
    if (!key) {
      console.error('Usage: node scripts/reset_rate_limiter.js <key>')
      console.error('Example key formats: email:foo@bar.com  or ip:127.0.0.1')
      process.exit(2)
    }

    const env = await loadEnv()
    const host = env.DB_HOST || process.env.DB_HOST || 'localhost'
    const port = parseInt(env.DB_PORT || process.env.DB_PORT || '3306')
    const user = env.DB_USER || process.env.DB_USER
    const password = env.DB_PASSWORD || process.env.DB_PASSWORD
    const database = env.DB_NAME || process.env.DB_NAME

    if (!user || !database) {
      console.error('DB_USER or DB_NAME not set in .env.local or environment')
      process.exit(2)
    }

    const redisUrl = env.REDIS_URL || process.env.REDIS_URL || ''
    const redisHost = env.REDIS_HOST || process.env.REDIS_HOST
    const redisPort = env.REDIS_PORT || process.env.REDIS_PORT || '6379'

    // Attempt Redis delete if configured
    if (redisUrl || redisHost) {
      try {
        const ioredis = await import('ioredis')
        const RedisCtor = (ioredis && (ioredis.default || ioredis))
        const client = redisUrl ? new RedisCtor(redisUrl) : new RedisCtor({ host: redisHost, port: parseInt(redisPort) })
        const countKey = `rl:count:${encodeKey(key)}`
        const lockKey = `rl:lock:${encodeKey(key)}`
        console.log('Deleting redis keys:', countKey, lockKey)
        await client.del(countKey, lockKey)
        try { await client.quit() } catch {}
      } catch (e) {
        console.warn('Redis cleanup skipped (error initializing redis):', e)
      }
    } else {
      console.log('No redis config found; skipping redis cleanup')
    }

    // DB cleanup
    console.log('Connecting to DB', { host, port, user, database })
    const conn = await mysql.createConnection({ host, port, user, password, database })
    try {
      const [r1] = await conn.execute('DELETE FROM rate_limiter_counts WHERE key_name = ?', [key])
      const [r2] = await conn.execute('DELETE FROM auth_locks WHERE key_name = ?', [key])
      console.log('DB cleanup done:', { rate_limiter_counts_deleted: r1.affectedRows, auth_locks_deleted: r2.affectedRows })
    } catch (e) {
      console.warn('DB cleanup error (tables may not exist):', e.message || e)
    }
    await conn.end()

    console.log('Rate limiter reset completed for key:', key)
    process.exit(0)
  } catch (err) {
    console.error('Reset failed:', err)
    process.exit(1)
  }
}

main()
