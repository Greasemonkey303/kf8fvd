#!/usr/bin/env node

const MAX_REDIRECTS = 5
const REQUIRED_HEADERS = [
  'content-security-policy',
  'strict-transport-security',
  'x-content-type-options',
  'x-frame-options',
  'referrer-policy',
  'permissions-policy',
]

function getSiteUrl() {
  const raw = process.env.SITE_URL || process.env.NEXT_PUBLIC_SITE_URL || ''
  if (!raw) throw new Error('SITE_URL or NEXT_PUBLIC_SITE_URL is required')
  const url = new URL(raw)
  if (url.protocol !== 'https:' && process.env.SMOKE_ALLOW_HTTP !== '1') throw new Error('Production smoke target must use HTTPS')
  return url
}

async function fetchWithoutRedirect(url, init = {}) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10_000)
  try {
    return await fetch(url, { ...init, redirect: 'manual', signal: controller.signal })
  } finally {
    clearTimeout(timeout)
  }
}

async function followRedirects(startUrl) {
  const visited = new Set()
  let current = new URL(startUrl)

  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
    const key = current.toString()
    if (visited.has(key)) throw new Error(`Redirect loop detected at ${key}`)
    visited.add(key)

    const response = await fetchWithoutRedirect(current)
    if (response.status < 300 || response.status >= 400) return { response, finalUrl: current, redirects }

    const location = response.headers.get('location')
    if (!location) throw new Error(`Redirect ${response.status} from ${current} has no Location header`)
    current = new URL(location, current)
  }

  throw new Error(`More than ${MAX_REDIRECTS} redirects`)
}

async function expectStatus(base, pathname, expected, init) {
  const url = new URL(pathname, base)
  const response = await fetchWithoutRedirect(url, init)
  if (response.status !== expected) throw new Error(`${pathname} returned ${response.status}; expected ${expected}`)
  console.log(`PASS ${pathname} -> ${expected}`)
  return response
}

async function expectProtected(base, pathname) {
  const url = new URL(pathname, base)
  const response = await fetchWithoutRedirect(url)
  if (response.status === 404) {
    console.log(`PASS ${pathname} -> 404`)
    return
  }

  const location = response.headers.get('location')
  if (response.status === 302 && location) {
    const redirect = new URL(location, url)
    if (redirect.hostname.endsWith('.cloudflareaccess.com') && redirect.pathname.includes('/cdn-cgi/access/login/')) {
      console.log(`PASS ${pathname} -> Cloudflare Access`)
      return
    }
  }

  throw new Error(`${pathname} is not protected by origin 404 or Cloudflare Access`)
}

async function main() {
  const siteUrl = getSiteUrl()
  const home = await followRedirects(siteUrl)
  if (home.response.status !== 200) throw new Error(`Homepage returned ${home.response.status}; expected 200`)
  if (home.finalUrl.hostname !== siteUrl.hostname) throw new Error(`Homepage ended on unexpected host ${home.finalUrl.hostname}`)
  console.log(`PASS homepage -> 200 (${home.redirects} redirects)`)

  for (const header of REQUIRED_HEADERS) {
    if (!home.response.headers.get(header)) throw new Error(`Homepage is missing ${header}`)
  }
  console.log('PASS security headers')

  const health = await expectStatus(siteUrl, '/api/health', 200)
  const healthBody = await health.json()
  if (!healthBody || healthBody.ok !== true || Object.keys(healthBody).some((key) => key !== 'ok')) {
    throw new Error('Public health response must contain only { ok: true }')
  }
  console.log('PASS minimal public health payload')

  await expectStatus(siteUrl, '/admin', 404)
  await expectProtected(siteUrl, '/api/admin/health')
  await expectStatus(siteUrl, '/api/uploads/presign-post', 404, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ slug: 'smoke', filename: 'smoke.jpg', contentType: 'image/jpeg', size: 10 }),
  })
  await expectStatus(siteUrl, '/api/uploads/get/messages%2Fsmoke%2Fprivate.jpg', 404)

  console.log('Production smoke checks passed.')
}

main().catch((error) => {
  console.error(`FAIL ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
})
