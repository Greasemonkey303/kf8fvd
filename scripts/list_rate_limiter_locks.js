#!/usr/bin/env node
(async function main(){
  try {
    const Redis = require('ioredis')
    const redisUrl = process.env.REDIS_URL || (process.env.REDIS_HOST ? `redis://${process.env.REDIS_HOST}:${process.env.REDIS_PORT || 6379}` : 'redis://host.docker.internal:6379')
    const client = new Redis(redisUrl)
    try {
      const keys = (typeof client.keys === 'function') ? await client.keys('rl:lock:*') : []
      if (!keys || keys.length === 0) {
        console.log('No locks found')
        try { await client.quit() } catch {}
        process.exit(0)
      }
      const locks = []
      for (const k of keys) {
        let ttl = null
        try { if (typeof client.pttl === 'function') { const t = await client.pttl(k); ttl = (typeof t === 'number' && t > 0) ? t : null } } catch {}
        const name = decodeURIComponent(String(k).slice('rl:lock:'.length))
        locks.push({ redisKey: k, key: name, ttlMs: ttl, expiresAt: ttl ? Date.now() + ttl : null })
      }
      console.log(JSON.stringify({ ok: true, source: 'redis', locks }, null, 2))
      try { await client.quit() } catch {}
      process.exit(0)
    } catch (e) {
      try { await client.quit() } catch {}
      console.error('Error listing locks:', e && e.message ? e.message : String(e))
      process.exit(2)
    }
  } catch (err) {
    console.error('Failed to run list script (ioredis may be missing):', err && err.message ? err.message : String(err))
    process.exit(3)
  }
})()
