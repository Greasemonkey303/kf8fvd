import { NextResponse } from 'next/server'
import { requireAdmin, getSessionServer } from '@/lib/auth'

export async function GET() {
  try {
    const sessionRaw = await getSessionServer()
    const admin = await requireAdmin()
    let user = null
    if (sessionRaw && typeof sessionRaw === 'object' && 'user' in (sessionRaw as Record<string, unknown>)) {
      const s = sessionRaw as Record<string, unknown>
      const u = s.user as Record<string, unknown> | undefined
      if (u && typeof u === 'object') {
        const name = typeof u.name === 'string' ? u.name : undefined
        const email = typeof u.email === 'string' ? u.email : undefined
        if (name && email) user = { name, email }
      }
    }
    return NextResponse.json({ admin: !!admin, user })
  } catch (e: unknown) {
    return NextResponse.json({ admin: false }, { status: 200 })
  }
}
