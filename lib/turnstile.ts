async function fetchWithTimeout(input: string, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(input, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timeout)
  }
}

type TurnstileVerificationOptions = {
  remoteIp?: string
}

type TurnstileVerificationResponse = {
  success?: boolean
  hostname?: string
  action?: string
}

function getExpectedHostname() {
  if (process.env.CF_TURNSTILE_EXPECTED_HOSTNAME) return process.env.CF_TURNSTILE_EXPECTED_HOSTNAME.trim().toLowerCase()
  if (process.env.NODE_ENV !== 'production') return ''
  try {
    return new URL(process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXTAUTH_URL || '').hostname.toLowerCase()
  } catch {
    return ''
  }
}

export async function verifyTurnstileToken(token?: string, options?: TurnstileVerificationOptions): Promise<boolean> {
  const secret = process.env.CF_TURNSTILE_SECRET
  if (!secret) return false
  if (!token) return false

  const maxAttempts = 3
  let attempt = 0
  let backoff = 250

  while (attempt < maxAttempts) {
    attempt += 1
    try {
      const form = new URLSearchParams({ secret, response: token })
      if (options?.remoteIp && options.remoteIp !== 'unknown') form.set('remoteip', options.remoteIp)

      const res = await fetchWithTimeout('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: form,
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
      const result = await res.json() as TurnstileVerificationResponse
      if (!result.success) return false

      const expectedHostname = getExpectedHostname()
      if (expectedHostname && String(result.hostname || '').toLowerCase() !== expectedHostname) return false

      const expectedAction = String(process.env.CF_TURNSTILE_EXPECTED_ACTION || '').trim()
      if (expectedAction && result.action !== expectedAction) return false

      return true
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
