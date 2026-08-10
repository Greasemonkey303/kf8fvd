import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { buildHealthPayload } from '@/app/api/health/route'

export const dynamic = 'force-dynamic'

export async function GET() {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const payload = await buildHealthPayload()
  return NextResponse.json(payload, {
    status: payload.ok ? 200 : 503,
    headers: { 'Cache-Control': 'no-store' },
  })
}
