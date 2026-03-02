import { NextResponse } from 'next/server'
import { requireAdmin, getSessionServer } from '@/lib/auth'

export async function GET() {
  try {
    const session = await getSessionServer()
    const admin = await requireAdmin()
    return NextResponse.json({ admin: !!admin, user: session?.user ? { name: session.user.name, email: session.user.email } : null })
  } catch (e:any) {
    return NextResponse.json({ admin: false }, { status: 200 })
  }
}
