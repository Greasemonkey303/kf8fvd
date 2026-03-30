import { describe, it, expect } from 'vitest'
import { exec as execCb } from 'child_process'
import { promisify } from 'util'
import net from 'net'

const exec = promisify(execCb)

function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer()
    srv.listen(0, () => {
      const addr = srv.address()
      let port: number | null = null
      if (addr && typeof addr === 'object' && 'port' in addr) port = (addr as { port?: number }).port ?? null
      srv.close(() => {
        if (port != null) resolve(port)
        else reject(new Error('Failed to obtain free port'))
      })
    })
    srv.on('error', reject)
  })
}

async function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)) }

async function getConfiguredRedisUrl() {
  const config = await import('../../lib/rateLimiterConfig')
  return config.getRedisUrl()
}

describe('admin auth locks integration', () => {
  it('creates a lock via rateLimiter and unlocks via admin API', async () => {
    // Prefer an existing REDIS_URL (CI will set this). If not present, try to start a Docker redis.
    let redisUrl = process.env.REDIS_URL || await getConfiguredRedisUrl() || ''
    const container = 'kf8fvd-redis-adminlocks-test'
    let startedContainer = false

      if (!redisUrl) {
        try { await exec('docker version --format "{{.Server.Version}}"') } catch {
          // Docker not available and no REDIS_URL -> skip test
          console.warn('Docker not available and REDIS_URL not set; skipping admin locks test')
          return
        }
      const port = await getFreePort()
      redisUrl = `redis://127.0.0.1:${port}`
      try { await exec(`docker rm -f ${container}`) } catch { }
      await exec(`docker run -d --name ${container} -p ${port}:6379 redis:7`)
      startedContainer = true

      const Redis = (await import('ioredis')).default || (await import('ioredis'))
      const rClient = new Redis(redisUrl)
      let ready = false
      for (let i = 0; i < 30; i++) {
        try { if ((await rClient.ping()) === 'PONG') { ready = true; break } } catch { await sleep(500) }
      }
      if (!ready) {
        try { rClient.disconnect() } catch { }
        await exec(`docker rm -f ${container}`)
        throw new Error('Redis did not become ready in time')
      }
      try { rClient.disconnect() } catch { }
    }

    // Ensure admin key is set for the route to authorize
    process.env.REDIS_URL = redisUrl
    process.env.ADMIN_API_KEY = 'test_admin_key'

    // Import rateLimiter and trigger a lock (max=1 causes immediate lock)
    const rl = await import('../../lib/rateLimiter')
    rl.__test_resetInternalState()
    const { incrementFailure } = rl
    const KEY = 'admin:test:key'
    const res = await incrementFailure(KEY, { max: 1, windowMs: 60_000, lockMs: 60_000 })
    expect(res).toBeDefined()
    expect(res.locked === true || res.locked === false).toBe(true)

    // Import admin route handlers and call them directly
    const admin = await import('../../app/api/admin/auth-locks/route')
    const { GET, POST } = admin

    const getReq = new Request('http://localhost', { headers: { 'x-admin-key': 'test_admin_key' } })
    const getRes = await GET(getReq)
    const j = await (getRes as Response).json()
    expect(j.ok).toBe(true)
    expect(Array.isArray(j.locks)).toBe(true)
    const found = Array.isArray(j.locks) && j.locks.some((l: unknown) => {
      if (typeof l !== 'object' || l === null) return false
      const keyVal = (l as Record<string, unknown>)['key']
      return String(keyVal) === KEY
    })
    expect(found).toBe(true)

    // Unlock via POST
    const postReq = new Request('http://localhost', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-admin-key': 'test_admin_key' }, body: JSON.stringify({ key: KEY }) })
    const postRes = await POST(postReq)
    const pj = await (postRes as Response).json()
    expect(pj.ok).toBe(true)

    // Verify lock removed
    const getRes2 = await GET(getReq)
    const j2 = await (getRes2 as Response).json()
    const found2 = Array.isArray(j2.locks) && j2.locks.some((l: unknown) => {
      if (typeof l !== 'object' || l === null) return false
      const keyVal = (l as Record<string, unknown>)['key']
      return String(keyVal) === KEY
    })
    expect(found2).toBe(false)

    if (startedContainer) {
      try { await exec(`docker rm -f ${container}`) } catch { }
    }
  }, 120000)
})
