#!/usr/bin/env node
// Simple Redis failover/connectivity tester. Provide REDIS_FAILOVER_URLS as
// comma-separated Redis URLs (or set REDIS_URL). The script will attempt to
// connect to each and perform a write/read to verify availability.
const ioredisImport = require('ioredis')
const Redis = (ioredisImport && ioredisImport.default) ? ioredisImport.default : ioredisImport

(function normalizeEnv(){
  // ensure we coerce different environment shapes into a comma-separated string
  let raw = process.env.REDIS_FAILOVER_URLS || process.env.REDIS_URL || ''
  if (Array.isArray(raw)) raw = raw.join(',')
  if (typeof raw === 'object' && raw !== null) raw = JSON.stringify(raw)
  raw = String(raw || '')
  process.env.__REDIS_FAILOVER_NORMALIZED__ = raw
})()

const urlsEnv = process.env.__REDIS_FAILOVER_NORMALIZED__ || ''
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
      try { r.disconnect() } catch {}
    }
  }
  console.log('If you have a multi-node Redis you can force a failover and re-run this script to verify client behavior.')
  process.exit(0)
})()
