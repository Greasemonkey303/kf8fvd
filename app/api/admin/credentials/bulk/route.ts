import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { archiveDeletedContent } from '@/lib/deletionArchive'
import { query } from '@/lib/db'
import { deleteObjectStrict, deletePrefixStrict, listObjectKeysByPrefix, resolveObjectKeyFromReference } from '@/lib/objectStorage'
import { parseJsonObject, readEnumString, readNumberArray, validationErrorResponse } from '@/lib/validation'

const getErrMsg = (err: unknown) => {
  if (err instanceof Error) return err.message
  try { return String(err) } catch { return 'Unknown error' }
}

export async function POST(req: Request) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  let action: string | null
  let ids: number[] | null
  try {
    const body = await parseJsonObject(req)
    action = readEnumString(body, 'action', ['publish', 'unpublish', 'delete'], { required: true })
    ids = readNumberArray(body, 'ids', { integer: true, min: 1, maxItems: 1000 })
    if (!ids || ids.length === 0) return NextResponse.json({ error: 'Validation failed', details: [{ field: 'ids', message: 'ids is required' }] }, { status: 400 })
  } catch (error) {
    const response = validationErrorResponse(error)
    if (response) return response
    throw error
  }

  try {
    const placeholders = ids.map(() => '?').join(',')
    if (action === 'publish' || action === 'unpublish') {
      const val = action === 'publish' ? 1 : 0
      await query(`UPDATE credentials SET is_published = ? WHERE id IN (${placeholders})`, [val, ...ids])
      return NextResponse.json({ ok: true })
    }

    // delete
    if (action === 'delete') {
      const rows = await query<Array<Record<string, unknown>>>(`SELECT * FROM credentials WHERE id IN (${placeholders})`, ids)
      for (const row of rows || []) {
        const prefix = String(row.s3_prefix || '')
        const prefixKeys = prefix ? await listObjectKeysByPrefix(`${prefix}/`) : []
        const imageKey = resolveObjectKeyFromReference(row.image_path)
        await archiveDeletedContent({ contentType: 'credential', originalId: Number(row.id || 0), slug: String(row.slug || prefix || row.id || ''), snapshot: row, objectReferences: [...prefixKeys, imageKey], deletedBy: admin.email })
        if (prefix) await deletePrefixStrict(`${prefix}/`)
        if (imageKey) await deleteObjectStrict(imageKey)
      }

      await query(`DELETE FROM credentials WHERE id IN (${placeholders})`, ids)
      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ error: 'Unhandled action' }, { status: 400 })
  } catch (err) {
    return NextResponse.json({ error: getErrMsg(err) }, { status: 500 })
  }
}
