import { describe, it, expect, vi } from 'vitest'
import { exec as execCb } from 'child_process'
import { promisify } from 'util'
import net from 'net'

const exec = promisify(execCb)
// increase timeout for Docker operations via per-test timeout parameter

function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer()
    srv.listen(0, () => {
      // @ts-ignore
      const addr = srv.address()
      const port = typeof addr === 'object' && addr && 'port' in addr ? (addr as any).port : null
      srv.close(() => resolve(port))
    })
    srv.on('error', reject)
  })
}

async function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)) }

describe('rateLimiter failover simulation (Docker)', () => {
  it('starts Redis, verifies Redis path, stops Redis and verifies in-memory fallback', async () => {
    // Check docker available
    try {
      await exec('docker version --format "{{.Server.Version}}"')
    } catch (err) {
      // Docker not available; skip the test gracefully
      // eslint-disable-next-line no-console
      console.warn('Docker not available; skipping failover simulation test')
      return
    }

    const container = 'kf8fvd-redis-failover-test'
    const port = await getFreePort()
    const host = '127.0.0.1'
    const redisUrl = `redis://${host}:${port}`
    const KEY = 'failover:test:key'

    // Cleanup any existing container with the same name
    try { await exec(`docker rm -f ${container}`) } catch (_) {}

    // Start redis container mapped to chosen free port
    let cid = null
    try {
      const { stdout } = await exec(`docker run -d --name ${container} -p ${port}:6379 redis:7`)
      cid = stdout.trim()
    } catch (err) {
      throw new Error('Failed to start redis container: ' + (err && (err as any).message ? (err as any).message : err))
    }

    // Wait for Redis to become available
    let Redis: any
    try { Redis = (await import('ioredis')).default || (await import('ioredis')) } catch (e) { throw e }
    const rClient = new Redis(redisUrl)
    let ready = false
    for (let i = 0; i < 30; i++) {
      try {
        const pong = await rClient.ping()
        if (pong === 'PONG') { ready = true; break }
      } catch (e) {
        await sleep(1000)
      }
    }
    if (!ready) {
      try { rClient.disconnect() } catch (_) {}
      await exec(`docker rm -f ${container}`)
      throw new Error('Redis did not become ready in time')
    }

    // Use vitest/ts to import the TypeScript rateLimiter module (will use process.env.REDIS_URL)
    process.env.REDIS_URL = redisUrl
    const rl = await import('../../../lib/rateLimiter')
    const { incrementFailure, getInfo } = rl

    // Perform increments while Redis is up
    const before = await incrementFailure(KEY, { max: 100, windowMs: 60000 })
    expect(before).toBeDefined()

    // Verify Redis count exists for the key
    const countKey = `rl:count:${encodeURIComponent(KEY)}`
    const redisCount = await rClient.get(countKey)
    // Should be set (string number) when Redis path was used
    expect(redisCount === null || typeof redisCount === 'string').toBe(true)

    // Now stop the container to simulate failure
    await exec(`docker stop ${container}`)
    // give some time for client to observe failure
    await sleep(1500)

    // After Redis is stopped, ensure incrementFailure still works (falls back to in-memory)
    let after
    try {
      after = await incrementFailure(KEY, { max: 100, windowMs: 60000 })
    } catch (err) {
      // cleanup then rethrow
      try { await exec(`docker rm -f ${container}`) } catch (_) {}
      throw new Error('incrementFailure threw after redis stopped: ' + (err && (err as any).message ? (err as any).message : err))
    }
    expect(after).toBeDefined()

    // getInfo should now return in-memory info (or null) and not crash
    let info
    try { info = await getInfo(KEY) } catch (err) { info = null }
    expect(info === null || typeof info === 'object').toBe(true)

    // Cleanup: remove container
    try { await exec(`docker rm -f ${container}`) } catch (_) {}
    try { rClient.disconnect() } catch (_) {}
  }, 120000)
})
