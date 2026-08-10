import { NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { incrementFailure, isLocked } from '@/lib/rateLimiter'
import { logRouteError, logRouteEvent } from '@/lib/observability'

export const dynamic = 'force-dynamic'

const FETCH_TIMEOUT_MS = 4_000
const MAX_PROVIDER_BYTES = 256 * 1024
const RATE_WINDOW_MS = 60_000
const RATE_MAX = 30

type LogbookEntry = {
  call: string
  date: string
  time: string
  band: string
  mode: string
  qth: string
  city: string
  state: string
  country: string
  lat?: number
  lon?: number
  display: string
}

function getRequestIp(request: Request) {
  return String(request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown').split(',')[0].trim() || 'unknown'
}

function unavailableResponse() {
  return NextResponse.json(
    { source: 'unavailable', entries: [], updatedAt: null },
    { headers: { 'Cache-Control': 'public, max-age=30, stale-while-revalidate=120' } },
  )
}

function normalizeCoordinate(value: unknown) {
  const number = Number(value)
  return Number.isFinite(number) ? number : undefined
}

function normalizeEntry(value: unknown): LogbookEntry | null {
  if (!value || typeof value !== 'object') return null
  const row = value as Record<string, unknown>
  const call = String(row.call || '').trim().toUpperCase().slice(0, 32)
  if (!call || !/^[A-Z0-9/]+$/.test(call)) return null

  const date = String(row.date || row.qso_date || '').trim().slice(0, 16)
  const time = String(row.time || row.time_on || '').trim().slice(0, 16)
  const band = String(row.band || '').trim().slice(0, 32)
  const mode = String(row.mode || '').trim().slice(0, 32)
  const qth = String(row.qth || '').trim().slice(0, 128)
  const city = String(row.city || '').trim().slice(0, 128)
  const state = String(row.state || '').trim().slice(0, 64)
  const country = String(row.country || '').trim().slice(0, 128)

  return {
    call,
    date,
    time,
    band,
    mode,
    qth,
    city,
    state,
    country,
    lat: normalizeCoordinate(row.lat),
    lon: normalizeCoordinate(row.lon),
    display: [date, call, band, mode].filter(Boolean).join(' - '),
  }
}

function getAllowedCustomOrigins() {
  return new Set(
    String(process.env.LOGBOOK_ALLOWED_ORIGINS || '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean)
      .flatMap((value) => {
        try {
          const url = new URL(value)
          return url.protocol === 'https:' ? [url.origin] : []
        } catch {
          return []
        }
      }),
  )
}

async function fetchCustomEntries() {
  if (process.env.LOGBOOK_PROVIDER !== 'custom' || !process.env.LOGBOOK_URL) return null

  const providerUrl = new URL(process.env.LOGBOOK_URL)
  const allowedOrigins = getAllowedCustomOrigins()
  if (providerUrl.protocol !== 'https:' || !allowedOrigins.has(providerUrl.origin)) {
    throw new Error('Custom logbook origin is not allowed')
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const headers: Record<string, string> = { Accept: 'application/json' }
    if (process.env.LOGBOOK_API_KEY) headers.Authorization = `Bearer ${process.env.LOGBOOK_API_KEY}`

    const response = await fetch(providerUrl, { headers, signal: controller.signal, cache: 'no-store', redirect: 'error' })
    if (!response.ok) throw new Error(`Custom logbook returned ${response.status}`)

    const declaredLength = Number(response.headers.get('content-length') || 0)
    if (declaredLength > MAX_PROVIDER_BYTES) throw new Error('Custom logbook response is too large')

    const text = await response.text()
    if (Buffer.byteLength(text, 'utf8') > MAX_PROVIDER_BYTES) throw new Error('Custom logbook response is too large')

    const parsed = JSON.parse(text)
    const rawEntries: unknown[] = Array.isArray(parsed) ? parsed : (parsed && Array.isArray(parsed.entries) ? parsed.entries : [])
    return rawEntries.slice(0, 200).map(normalizeEntry).filter((entry): entry is LogbookEntry => Boolean(entry))
  } finally {
    clearTimeout(timeout)
  }
}

export async function GET(request: Request) {
  const ip = getRequestIp(request)
  const rateKey = `logbook-ip:${ip}`

  if (await isLocked(rateKey)) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: { 'Retry-After': '60' } })
  }
  const rate = await incrementFailure(rateKey, {
    windowMs: RATE_WINDOW_MS,
    max: RATE_MAX,
    lockMs: RATE_WINDOW_MS,
    reason: 'logbook_request',
    countLoginAttempt: false,
  })
  if (rate.locked) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: { 'Retry-After': '60' } })
  }

  try {
    const rows = await query<Record<string, unknown>[]>(
      'SELECT `call`, DATE_FORMAT(qso_date, "%Y%m%d") AS date, TIME_FORMAT(time_on, "%H:%i:%s") AS time, band, mode, qth, city, state, country, lat, lon FROM call_logs ORDER BY COALESCE(qso_datetime, created_at) DESC LIMIT 200',
    )
    const entries = Array.isArray(rows) ? rows.map(normalizeEntry).filter((entry): entry is LogbookEntry => Boolean(entry)) : []
    if (entries.length) {
      return NextResponse.json(
        { source: 'db', entries, updatedAt: new Date().toISOString() },
        { headers: { 'Cache-Control': 'public, max-age=30, stale-while-revalidate=120' } },
      )
    }
  } catch (error) {
    logRouteError('api/logbook', error, { action: 'read_database', reason: 'db_query_failed' })
  }

  try {
    const customEntries = await fetchCustomEntries()
    if (customEntries?.length) {
      return NextResponse.json(
        { source: 'custom', entries: customEntries, updatedAt: new Date().toISOString() },
        { headers: { 'Cache-Control': 'public, max-age=30, stale-while-revalidate=120' } },
      )
    }
  } catch (error) {
    logRouteError('api/logbook', error, { action: 'read_custom_provider', reason: 'provider_failed' })
  }

  if (process.env.LOGBOOK_PROVIDER === 'qrz') {
    logRouteEvent('warn', { route: 'api/logbook', action: 'qrz_provider_disabled', reason: 'use_database_import_or_https_custom_provider' })
  }
  return unavailableResponse()
}
