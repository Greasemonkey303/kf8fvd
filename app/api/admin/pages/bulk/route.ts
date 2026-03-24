import { NextResponse } from 'next/server'
import { requireAdmin } from '../../../../../lib/auth'
import { query } from '../../../../../lib/db'
import { deletePrefixStrict } from '@/lib/objectStorage'

const getErrMsg = (err: unknown) => {
  if (err instanceof Error) return err.message
  try { return String(err) } catch { return 'Unknown error' }
}

export async function POST(req: Request) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json().catch(()=>({}))
  const idsRaw = Array.isArray(body?.ids) ? (body.ids as unknown[]) : []
  const ids: number[] = idsRaw.map(v => Number(v)).filter((n: number) => !Number.isNaN(n))
  const action = String(body?.action || '').toLowerCase()
  if (!ids.length) return NextResponse.json({ error: 'Missing ids' }, { status: 400 })

  const placeholders = ids.map(()=>'?').join(',')

  try {
    if (action === 'publish' || action === 'unpublish') {
      const val = action === 'publish' ? 1 : 0
      await query(`UPDATE pages SET is_published = ? WHERE id IN (${placeholders})`, [val, ...ids])
      return NextResponse.json({ ok: true })
    }

    if (action === 'delete') {
      // retrieve rows to return deleted items to client (for undo buffer)
      const rows = await query<Record<string, unknown>[]>(`SELECT id, slug, title, content, metadata, is_published FROM pages WHERE id IN (${placeholders})`, ids)

      const candidates: string[] = []
      if (process.env.S3_UPLOAD_PREFIX) candidates.push(process.env.S3_UPLOAD_PREFIX)
      candidates.push('about/')
      candidates.push('projects/')
      candidates.push('pages/')

      const normalize = (p: string) => String(p || '').replace(/^\/+/, '').replace(/\/+$/, '')
      const seen = new Set<string>()
      for (const r of rows) {
        const slug = String(r.slug || '')
        for (const rawPrefix of candidates) {
          const np = normalize(rawPrefix)
          if (!np) continue
          const candidate = np.endsWith('/') ? `${np}${slug}/` : `${np}/${slug}/`
          if (seen.has(candidate)) continue
          seen.add(candidate)
          await deletePrefixStrict(candidate)
        }
      }

      // delete rows
      await query(`DELETE FROM pages WHERE id IN (${placeholders})`, ids)
      return NextResponse.json({ ok: true, deleted: rows })
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  } catch (e) {
    return NextResponse.json({ error: getErrMsg(e) }, { status: 500 })
  }
}
