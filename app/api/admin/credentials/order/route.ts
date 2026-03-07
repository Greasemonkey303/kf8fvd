import { NextResponse } from 'next/server'
import { requireAdmin } from '../../../../../../lib/auth'
import { transaction } from '../../../../../../lib/db'

export async function POST(req: Request) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json()
  const list = Array.isArray(body && body.order) ? body.order : null
  if (!list) return NextResponse.json({ error: 'Missing order array' }, { status: 400 })

  try {
    await transaction(async (conn) => {
      for (const item of list) {
        const id = item.id
        const so = item.sort_order || 0
        await conn.execute('UPDATE credentials SET sort_order = ? WHERE id = ?', [so, id])
      }
    })
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
