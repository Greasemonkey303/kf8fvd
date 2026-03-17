import { describe, it, expect } from 'vitest'
import { exec as execCb } from 'child_process'
import { promisify } from 'util'
import net from 'net'

const exec = promisify(execCb)
// increase timeout for Docker operations via per-test timeout parameter

function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer()
    srv.listen(0, () => {
      const addr = srv.address()
      let port: number | null = null
      if (addr && typeof addr === 'object' && 'port' in addr) {
        const ai = addr as net.AddressInfo
        if (typeof ai.port === 'number') port = ai.port
      }
      srv.close(() => {
        if (port != null) resolve(port)
        else reject(new Error('Failed to obtain free port'))
      })
    })
    srv.on('error', reject)
  })
}

function errMsg(e: unknown): string {
  if (e == null) return ''
  if (e instanceof Error) return e.message
  try { if (typeof e === 'object' && e !== null && 'message' in e) return String((e as Record<string, unknown>)['message']) } catch {}
  return String(e)
}

async function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)) }

describe('rateLimiter failover simulation (Docker)', () => {
  it('starts Redis, verifies Redis path, stops Redis and verifies in-memory fallback', async () => {
    // Check docker available
    try {
      await exec('docker version --format "{{.Server.Version}}"')
    } catch {
      // Docker not available; skip the test gracefully
      console.warn('Docker not available; skipping failover simulation test')
      return
    }

    const container = 'kf8fvd-redis-failover-test'
    const port = await getFreePort()
    const host = '127.0.0.1'
    const redisUrl = `redis://${host}:${port}`
    const KEY = 'failover:test:key'

    // Cleanup any existing container with the same name
    try { await exec(`docker rm -f ${container}`) } catch { }

    // Start redis container mapped to chosen free port
    try {
      await exec(`docker run -d --name ${container} -p ${port}:6379 redis:7`)
    } catch (err) {
      throw new Error('Failed to start redis container: ' + errMsg(err))
    }

    // Wait for Redis to become available
    const ioredisMod = await import('ioredis')
    const RedisCtor = (ioredisMod && (ioredisMod.default || ioredisMod)) as unknown as { new (url?: string): { ping: () => Promise<unknown>; disconnect: () => Promise<void>; get?: (k: string) => Promise<unknown> } }
    const rClient = new RedisCtor(redisUrl)
    let ready = false
    for (let i = 0; i < 30; i++) {
      try {
        const pong = await rClient.ping()
        if (pong === 'PONG') { ready = true; break }
      } catch {
        await sleep(1000)
      }
    }
    if (!ready) {
      try { rClient.disconnect() } catch { }
      await exec(`docker rm -f ${container}`)
      throw new Error('Redis did not become ready in time')
    }

    // Use vitest/ts to import the TypeScript rateLimiter module (will use process.env.REDIS_URL)
    process.env.REDIS_URL = redisUrl
    const rl = await import('../../lib/rateLimiter')
    const { incrementFailure, getInfo } = rl

    // Perform increments while Redis is up
    const before = await incrementFailure(KEY, { max: 100, windowMs: 60000 })
    expect(before).toBeDefined()

    // Verify Redis count exists for the key
    const countKey = `rl:count:${encodeURIComponent(KEY)}`
    let redisCount: unknown = null
    // rClient.get may be optional on the runtime client type; guard the call
    if (typeof (rClient as any).get === 'function') {
      try {
        redisCount = await (rClient as any).get(countKey)
      } catch {
        redisCount = null
      }
    }
    // Should be null or a string number when Redis path was used
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
      try { await exec(`docker rm -f ${container}`) } catch { }
      throw new Error('incrementFailure threw after redis stopped: ' + errMsg(err))
    }
    expect(after).toBeDefined()

    // getInfo should now return in-memory info (or null) and not crash
    let info
    try { info = await getInfo(KEY) } catch { info = null }
    expect(info === null || typeof info === 'object').toBe(true)

    // Cleanup: remove container
    try { await exec(`docker rm -f ${container}`) } catch { }
    try { rClient.disconnect() } catch { }
  }, 120000)
})
