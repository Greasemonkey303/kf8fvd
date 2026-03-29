import { NextResponse } from 'next/server'
import { logRouteError, logRouteEvent } from '@/lib/observability'

type ClientErrorReport = {
  type?: string
  message?: string
  stack?: string | null
  url?: string | null
  source?: string | null
  status?: number | null
  method?: string | null
  route?: string | null
  count?: number
  href?: string | null
  userAgent?: string | null
  timestamp?: string | null
}

function sanitize(value: unknown, max = 2000) {
  if (value == null) return null
  const text = String(value)
  return text.length > max ? text.slice(0, max) : text
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as ClientErrorReport
    const report = {
      type: sanitize(body.type, 80),
      message: sanitize(body.message, 800),
      stack: sanitize(body.stack, 2000),
      url: sanitize(body.url, 1000),
      source: sanitize(body.source, 1000),
      status: typeof body.status === 'number' ? body.status : null,
      method: sanitize(body.method, 16),
      route: sanitize(body.route, 500),
      count: typeof body.count === 'number' ? body.count : 1,
      href: sanitize(body.href, 1000),
      userAgent: sanitize(body.userAgent, 500),
      timestamp: sanitize(body.timestamp, 80),
      ip: sanitize(req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip'), 120),
    }

    if (!report.type || !report.message) {
      return NextResponse.json({ error: 'Invalid client error report' }, { status: 400 })
    }

    logRouteEvent('error', { route: 'api/client-errors', action: 'client_error_received', reason: report.type, status: report.status, method: report.method, resourceId: report.route || report.url || null, ip: report.ip, count: report.count, href: report.href, source: report.source, message: report.message })
    return NextResponse.json({ ok: true }, { status: 202 })
  } catch (error) {
    logRouteError('api/client-errors', error, { action: 'client_error_payload_failed', reason: 'invalid_payload' })
    return NextResponse.json({ error: 'Invalid client error payload' }, { status: 400 })
  }
}