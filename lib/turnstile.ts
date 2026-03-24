async function fetchWithTimeout(input: string, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(input, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timeout)
  }
}

export async function verifyTurnstileToken(token?: string): Promise<boolean> {
  const bypass = (process.env.CF_TURNSTILE_BYPASS || '').toLowerCase()
  if ((bypass === '1' || bypass === 'true') && process.env.NODE_ENV !== 'production') return true
  const secret = process.env.CF_TURNSTILE_SECRET
  if (!secret) return true
  if (!token) return false

  const maxAttempts = 3
  let attempt = 0
  let backoff = 250

  while (attempt < maxAttempts) {
    attempt += 1
    try {
      const res = await fetchWithTimeout('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ secret, response: token }),
      }, 5000)

      if (res.status === 429) {
        // respect Retry-After if provided
        const ra = res.headers.get('retry-after')
        const waitMs = ra ? (Number(ra) * 1000) : backoff
        try { console.warn('[turnstile] rate limited, retrying after', waitMs) } catch {}
        await new Promise((r) => setTimeout(r, waitMs))
        backoff *= 2
        continue
      }

      if (res.status >= 500 && res.status < 600) {
        // transient server error
        await new Promise((r) => setTimeout(r, backoff))
        backoff *= 2
        continue
      }

      // parse response and return success flag
      const j = await res.json()
      return !!j?.success
    } catch (e) {
      // network error - retry with backoff
      try { console.warn('[turnstile] verify fetch error, retrying', e) } catch {}
      await new Promise((r) => setTimeout(r, backoff))
      backoff *= 2
      continue
    }
  }
  return false
}
