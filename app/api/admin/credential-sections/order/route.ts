import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { transaction } from '@/lib/db'
import { parseJsonObject, validationErrorResponse } from '@/lib/validation'

export async function POST(req: Request) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  let list: Array<{ id: number; sort_order: number }>
  try {
    const body = await parseJsonObject(req)
    if (!Array.isArray(body.order)) return NextResponse.json({ error: 'Validation failed', details: [{ field: 'order', message: 'order must be an array' }] }, { status: 400 })
    list = body.order.map((item) => ({ id: Number((item as Record<string, unknown>).id), sort_order: Number((item as Record<string, unknown>).sort_order || 0) }))
    if (list.some((item) => !Number.isInteger(item.id) || item.id < 1)) return NextResponse.json({ error: 'Validation failed', details: [{ field: 'order', message: 'order contains an invalid id' }] }, { status: 400 })
    if (list.some((item) => !Number.isFinite(item.sort_order))) return NextResponse.json({ error: 'Validation failed', details: [{ field: 'order', message: 'order contains an invalid sort_order' }] }, { status: 400 })
  } catch (error) {
    const response = validationErrorResponse(error)
    if (response) return response
    return NextResponse.json({ error: 'Validation failed', details: [{ field: 'order', message: 'order must be an array of objects' }] }, { status: 400 })
  }

  try {
    await transaction(async (conn) => {
      for (const item of list) {
        const id = item.id
        const so = item.sort_order || 0
        await conn.execute('UPDATE credential_sections SET sort_order = ? WHERE id = ?', [so, id])
      }
    })
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
