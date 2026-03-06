import { NextResponse } from 'next/server'
import { requireAdmin } from '../../../../../lib/auth'
import { transaction } from '../../../../../lib/db'

const parseOrderId = (id: string) => {
  // formats: "<pageId>-c-<cardIdx>" or "<pageId>-about"/"<pageId>-topology"/"<pageId>-hamshack"
  if (!id) return null
  const m = id.match(/^(\d+)-c-(\d+)$/)
  if (m) return { pageId: Number(m[1]), kind: 'card' as const, index: Number(m[2]) }
  const m2 = id.match(/^(\d+)-([a-zA-Z0-9_-]+)$/)
  if (m2) return { pageId: Number(m2[1]), kind: 'named' as const, name: m2[2] }
  return null
}

export async function POST(req: Request) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json().catch(() => ({}))
  const order = Array.isArray(body?.order) ? body.order as string[] : null
  if (!order) return NextResponse.json({ error: 'Order array required' }, { status: 400 })

  const entries = order.map((id, idx) => ({ raw: id, pos: idx, parsed: parseOrderId(String(id)) }))
  const pageIds = Array.from(new Set(entries.map(e => e.parsed && e.parsed.pageId).filter(Boolean))) as number[]
  if (pageIds.length === 0) return NextResponse.json({ ok: true })

  try {
    await transaction(async (connection: any) => {
      const placeholders = pageIds.map(() => '?').join(',')
      const [rows]: any = await connection.execute(`SELECT id, metadata FROM pages WHERE id IN (${placeholders})`, pageIds)
      const rowsById: Record<number, any> = {}
      for (const r of rows) rowsById[Number(r.id)] = r

      // prepare a map of updated metadata per page so we only persist once per page
      const updatedMeta: Record<number, any> = {}

      for (const entry of entries) {
        if (!entry.parsed) continue
        const pid = entry.parsed.pageId
        // initialize meta from the original DB row (once)
        if (!(pid in updatedMeta)) {
          const r = rowsById[pid]
          try { updatedMeta[pid] = r && r.metadata ? (typeof r.metadata === 'string' ? JSON.parse(r.metadata) : r.metadata) : {} } catch { updatedMeta[pid] = {} }
        }

        const meta = updatedMeta[pid]
        if (!meta) continue

        if (entry.parsed.kind === 'card') {
          const idx = entry.parsed.index ?? 0
          if (!Array.isArray(meta.cards)) meta.cards = meta.cards || []
          if (meta.cards[idx]) meta.cards[idx].position = entry.pos
        } else if (entry.parsed.kind === 'named') {
          const name = String(entry.parsed.name)
          const key = name + 'Card'
          if (meta[key]) meta[key].position = entry.pos
        }
      }

      // persist each updated page once
      for (const pidStr of Object.keys(updatedMeta)) {
        const pid = Number(pidStr)
        const meta = updatedMeta[pid]
        await connection.execute('UPDATE pages SET metadata = ? WHERE id = ?', [JSON.stringify(meta), pid])
      }
    })
    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    // eslint-disable-next-line no-console
    console.error('reorder error', err)
    return NextResponse.json({ error: (err instanceof Error ? err.message : String(err)) }, { status: 500 })
  }
}
