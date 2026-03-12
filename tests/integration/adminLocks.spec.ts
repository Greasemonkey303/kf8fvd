import { describe, it, expect } from 'vitest'
import { exec as execCb } from 'child_process'
import { promisify } from 'util'
import net from 'net'

const exec = promisify(execCb)

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

describe('admin auth locks integration', () => {
  it('creates a lock via rateLimiter and unlocks via admin API', async () => {
    // Prefer an existing REDIS_URL (CI will set this). If not present, try to start a Docker redis.
    let redisUrl = process.env.REDIS_URL || ''
    const container = 'kf8fvd-redis-adminlocks-test'
    let startedContainer = false

    if (!redisUrl) {
      try { await exec('docker version --format "{{.Server.Version}}"') } catch (err) {
        // Docker not available and no REDIS_URL -> skip test
        // eslint-disable-next-line no-console
        console.warn('Docker not available and REDIS_URL not set; skipping admin locks test')
        return
      }
      const port = await getFreePort()
      redisUrl = `redis://127.0.0.1:${port}`
      try { await exec(`docker rm -f ${container}`) } catch (_) {}
      const { stdout } = await exec(`docker run -d --name ${container} -p ${port}:6379 redis:7`)
      startedContainer = true

      const Redis = (await import('ioredis')).default || (await import('ioredis'))
      const rClient = new Redis(redisUrl)
      let ready = false
      for (let i = 0; i < 30; i++) {
        try { if ((await rClient.ping()) === 'PONG') { ready = true; break } } catch (e) { await sleep(500) }
      }
      if (!ready) {
        try { rClient.disconnect() } catch (_) {}
        await exec(`docker rm -f ${container}`)
        throw new Error('Redis did not become ready in time')
      }
      try { rClient.disconnect() } catch (_) {}
    }

    // Ensure admin key is set for the route to authorize
    process.env.REDIS_URL = redisUrl
    process.env.ADMIN_API_KEY = 'test_admin_key'

    // Import rateLimiter and trigger a lock (max=1 causes immediate lock)
    const rl = await import('../../../lib/rateLimiter')
    const { incrementFailure } = rl
    const KEY = 'admin:test:key'
    const res = await incrementFailure(KEY, { max: 1, windowMs: 60_000, lockMs: 60_000 })
    expect(res).toBeDefined()
    expect(res.locked === true || res.locked === false).toBe(true)

    // Import admin route handlers and call them directly
    const admin = await import('../../../app/api/admin/auth-locks/route')
    const { GET, POST } = admin

    const getReq = new Request('http://localhost', { headers: { 'x-admin-key': 'test_admin_key' } })
    const getRes = await GET(getReq)
    const j = await (getRes as Response).json()
    expect(j.ok).toBe(true)
    expect(Array.isArray(j.locks)).toBe(true)
    const found = j.locks.some((l: any) => l.key === KEY)
    expect(found).toBe(true)

    // Unlock via POST
    const postReq = new Request('http://localhost', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-admin-key': 'test_admin_key' }, body: JSON.stringify({ key: KEY }) })
    const postRes = await POST(postReq)
    const pj = await (postRes as Response).json()
    expect(pj.ok).toBe(true)

    // Verify lock removed
    const getRes2 = await GET(getReq)
    const j2 = await (getRes2 as Response).json()
    const found2 = j2.locks.some((l: any) => l.key === KEY)
    expect(found2).toBe(false)

    if (startedContainer) {
      try { await exec(`docker rm -f ${container}`) } catch (_) {}
    }
  }, 120000)
})
