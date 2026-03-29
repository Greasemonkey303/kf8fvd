import { NextRequest, NextResponse } from 'next/server'
import { recordObservedRequest } from '@/lib/monitoringMetrics'

export const dynamic = 'force-dynamic'

function getInternalMetricsToken() {
  return process.env.NEXTAUTH_SECRET || ''
}

export async function POST(request: NextRequest) {
  const expectedToken = getInternalMetricsToken()
  const providedToken = request.headers.get('x-internal-metrics-token') || ''

  if (!expectedToken || providedToken !== expectedToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  const pathname = body && typeof body.pathname === 'string' ? body.pathname : ''
  if (!pathname) {
    return NextResponse.json({ error: 'Missing pathname' }, { status: 400 })
  }

  await recordObservedRequest(pathname)
  return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } })
}