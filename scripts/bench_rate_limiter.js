#!/usr/bin/env node
/*
  Lightweight Redis bench for the rate-limiter Lua script.
  Usage:
    BENCH_CONCURRENCY=10 BENCH_REQUESTS=100 REDIS_URL=redis://127.0.0.1:6379 node scripts/bench_rate_limiter.js
*/
const Redis = require('ioredis')

const concurrency = Number(process.env.BENCH_CONCURRENCY || 10)
const totalRequests = Number(process.env.BENCH_REQUESTS || 100)
const redisUrl = process.env.REDIS_URL || process.env.REDIS_HOST ? `redis://${process.env.REDIS_HOST}:${process.env.REDIS_PORT || 6379}` : 'redis://127.0.0.1:6379'
const key = process.env.BENCH_KEY || 'bench:rateLimiter:key'
const windowMs = Number(process.env.BENCH_WINDOW_MS || 60000)
const max = Number(process.env.BENCH_MAX || 1000000)
const lockMs = Number(process.env.BENCH_LOCK_MS || 60000)

const lua = `
  local cnt = redis.call('INCR', KEYS[1])
  if cnt == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
  local lockTtl = redis.call('PTTL', KEYS[2])
  if tonumber(cnt) >= tonumber(ARGV[2]) then
    redis.call('SET', KEYS[2], '1', 'PX', ARGV[3])
    lockTtl = ARGV[3]
  end
  return {cnt, lockTtl}
`

function percentile(arr, p) {
  if (!arr.length) return 0
  const sorted = arr.slice().sort((a,b)=>a-b)
  const idx = Math.floor((p/100) * sorted.length)
  return sorted[Math.min(idx, sorted.length-1)]
}

(async function() {
  console.log('bench config', { concurrency, totalRequests, redisUrl, key })
  const r = new Redis(redisUrl)
  try {
    await r.ping()
  } catch (e) {
    console.error('Redis ping failed:', e && e.message ? e.message : e)
    process.exit(2)
  }

  const countKey = `rl:count:${encodeURIComponent(key)}`
  const lockKey = `rl:lock:${encodeURIComponent(key)}`

  let pointer = 0
  let errors = 0
  const latencies = []
  const start = Date.now()

  async function worker(id) {
    while (true) {
      const i = pointer++
      if (i >= totalRequests) return
      const s = Date.now()
      try {
        await r.eval(lua, 2, countKey, lockKey, windowMs, max, lockMs)
        latencies.push(Date.now() - s)
      } catch (e) {
        errors++
      }
    }
  }

  const workers = []
  for (let i=0;i<Math.min(concurrency, totalRequests);i++) workers.push(worker(i))
  await Promise.all(workers)

  const duration = (Date.now() - start) / 1000
  const ops = totalRequests
  console.log(`Done: ${ops} ops in ${duration.toFixed(2)}s — ${Math.round(ops/duration)} ops/sec — errors=${errors}`)
  if (latencies.length) {
    console.log('latency ms — avg:', (latencies.reduce((a,b)=>a+b,0)/latencies.length).toFixed(2), 'p50:', percentile(latencies,50), 'p95:', percentile(latencies,95))
  }

  try { r.disconnect() } catch (_) {}
})()
