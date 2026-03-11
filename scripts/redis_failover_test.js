#!/usr/bin/env node
// Simple Redis failover/connectivity tester. Provide REDIS_FAILOVER_URLS as
// comma-separated Redis URLs (or set REDIS_URL). The script will attempt to
// connect to each and perform a write/read to verify availability.
const Redis = require('ioredis')

const urlsEnv = process.env.REDIS_FAILOVER_URLS || process.env.REDIS_URL || ''
if (!urlsEnv) {
  console.error('No REDIS_FAILOVER_URLS or REDIS_URL provided')
  process.exit(2)
}

const urls = urlsEnv.split(',').map(s => s.trim()).filter(Boolean)
(async function main(){
  for (const u of urls) {
    console.log('Testing redis url:', u)
    const r = new Redis(u)
    try {
      const key = `kf8fvd_failover_test:${Date.now()}`
      const start = Date.now()
      await r.set(key, 'ok', 'EX', 30)
      const val = await r.get(key)
      const dur = Date.now() - start
      console.log('  ok - value:', val, 'roundtrip_ms:', dur)
    } catch (err) {
      console.error('  error connecting or operating:', err && err.message ? err.message : err)
    } finally {
      try { r.disconnect() } catch(_){}
    }
  }
  console.log('If you have a multi-node Redis you can force a failover and re-run this script to verify client behavior.')
  process.exit(0)
})()
