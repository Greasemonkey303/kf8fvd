import { NextResponse } from 'next/server'
import { requireAdmin } from '../../../../../lib/auth'
import { archiveDeletedContent } from '@/lib/deletionArchive'
import { query } from '../../../../../lib/db'
import { deletePrefixStrict, listObjectKeysByPrefix } from '@/lib/objectStorage'
import { parseJsonObject, readEnumString, readNumberArray, validationErrorResponse } from '@/lib/validation'

const getErrMsg = (err: unknown) => {
  if (err instanceof Error) return err.message
  try { return String(err) } catch { return 'Unknown error' }
}

export async function POST(req: Request) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  let ids: number[] | null
  let action: string | null
  try {
    const body = await parseJsonObject(req)
    ids = readNumberArray(body, 'ids', { integer: true, min: 1, maxItems: 1000 })
    action = readEnumString(body, 'action', ['publish', 'unpublish', 'delete'], { required: true })
    if (!ids || ids.length === 0) return NextResponse.json({ error: 'Validation failed', details: [{ field: 'ids', message: 'ids is required' }] }, { status: 400 })
  } catch (error) {
    const response = validationErrorResponse(error)
    if (response) return response
    throw error
  }

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
        const archiveKeys: string[] = []
        for (const rawPrefix of candidates) {
          const np = normalize(rawPrefix)
          if (!np) continue
          const candidate = np.endsWith('/') ? `${np}${slug}/` : `${np}/${slug}/`
          if (seen.has(candidate)) continue
          seen.add(candidate)
          archiveKeys.push(...await listObjectKeysByPrefix(candidate))
        }
        await archiveDeletedContent({ contentType: 'page', originalId: Number(r.id || 0), slug, snapshot: r, objectReferences: archiveKeys, deletedBy: admin.email })
        for (const rawPrefix of candidates) {
          const np = normalize(rawPrefix)
          if (!np) continue
          const candidate = np.endsWith('/') ? `${np}${slug}/` : `${np}/${slug}/`
          if (!seen.has(candidate)) continue
          await deletePrefixStrict(candidate)
        }
      }

      // delete rows
      await query(`DELETE FROM pages WHERE id IN (${placeholders})`, ids)
      return NextResponse.json({ ok: true, deleted: rows })
    }

    return NextResponse.json({ error: 'Validation failed', details: [{ field: 'action', message: 'action contains an invalid value' }] }, { status: 400 })
  } catch (e) {
    return NextResponse.json({ error: getErrMsg(e) }, { status: 500 })
  }
}
