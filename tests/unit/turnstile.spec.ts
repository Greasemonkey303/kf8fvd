import { afterEach, describe, expect, it, vi } from 'vitest'
import { verifyTurnstileToken } from '@/lib/turnstile'

const originalSecret = process.env.CF_TURNSTILE_SECRET
const originalHostname = process.env.CF_TURNSTILE_EXPECTED_HOSTNAME

afterEach(() => {
  vi.unstubAllGlobals()
  if (originalSecret === undefined) delete process.env.CF_TURNSTILE_SECRET
  else process.env.CF_TURNSTILE_SECRET = originalSecret
  if (originalHostname === undefined) delete process.env.CF_TURNSTILE_EXPECTED_HOSTNAME
  else process.env.CF_TURNSTILE_EXPECTED_HOSTNAME = originalHostname
})

describe('verifyTurnstileToken', () => {
  it('fails closed when the secret or token is missing', async () => {
    delete process.env.CF_TURNSTILE_SECRET
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)

    await expect(verifyTurnstileToken('token')).resolves.toBe(false)
    await expect(verifyTurnstileToken()).resolves.toBe(false)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('accepts a successful response for the expected hostname', async () => {
    process.env.CF_TURNSTILE_SECRET = 'test-secret'
    process.env.CF_TURNSTILE_EXPECTED_HOSTNAME = 'www.example.com'
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true, hostname: 'www.example.com' }), { status: 200 })))

    await expect(verifyTurnstileToken('token', { remoteIp: '203.0.113.1' })).resolves.toBe(true)
  })

  it('rejects a response for another hostname', async () => {
    process.env.CF_TURNSTILE_SECRET = 'test-secret'
    process.env.CF_TURNSTILE_EXPECTED_HOSTNAME = 'www.example.com'
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true, hostname: 'attacker.example' }), { status: 200 })))

    await expect(verifyTurnstileToken('token')).resolves.toBe(false)
  })
})
