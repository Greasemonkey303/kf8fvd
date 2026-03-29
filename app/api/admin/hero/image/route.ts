import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { archiveDeletedContent } from '@/lib/deletionArchive'
import { query, transaction } from '@/lib/db'
import { deleteObjectStrict, resolveObjectKeyFromReference } from '@/lib/objectStorage'
import { generateWebpVariantForObject } from '@/lib/webpVariants'
import { parseJsonObject, readBoolean, readNumber, readString, validationErrorResponse } from '@/lib/validation'

export async function POST(req: Request) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const body = await parseJsonObject(req)
    const hero_id = readNumber(body, 'hero_id', { required: true, integer: true, min: 1 })
    const url = readString(body, 'url', { required: true, maxLength: 2048 })
    const alt = readString(body, 'alt', { maxLength: 255, allowEmpty: true })
    const is_featured = readBoolean(body, 'is_featured')
    const sort_order = readNumber(body, 'sort_order', { integer: true })
    // insert and capture insertId if available
    const insertRes = await query('INSERT INTO hero_image (hero_id, url, alt, is_featured, sort_order) VALUES (?, ?, ?, ?, ?)', [hero_id, url, alt || '', is_featured ? 1 : 0, sort_order || 0])
    const insertedId = (insertRes as unknown as { insertId?: number })?.insertId ?? undefined

    // if is_featured set, unset others
    if (is_featured) {
      await query('UPDATE hero_image SET is_featured = 0 WHERE hero_id = ? AND url <> ?', [hero_id, url])
    }

    // Generate a WebP sibling variant for faster delivery when possible.
    try {
      const objectKey = resolveObjectKeyFromReference(url) || undefined
      if (objectKey) {
        const variant = await generateWebpVariantForObject(objectKey)
        if (variant?.webpKey) {
          try {
            const potential = await query<Record<string, unknown>[]>('SELECT id FROM hero_image WHERE hero_id = ? AND url = ? ORDER BY created_at DESC LIMIT 1', [hero_id, url])
            const potentialId = (potential && potential[0] && (potential[0] as Record<string, unknown>).id) || undefined
            const targetId = insertedId || potentialId
            if (targetId) {
              await query('UPDATE hero_image SET variants = ? WHERE id = ?', [JSON.stringify({ webp: variant.webpKey }), targetId])
            }
          } catch (e) {
            console.error('failed to update hero_image variants', e)
          }
        }
      }
    } catch (e) {
      console.error('variant generation error', e)
    }

    const rows = await query<Record<string, unknown>[]>('SELECT * FROM hero_image WHERE hero_id = ? ORDER BY is_featured DESC, sort_order ASC', [hero_id])
    return NextResponse.json({ images: rows })
  } catch (err: unknown) {
    const validationResponse = validationErrorResponse(err)
    if (validationResponse) return validationResponse
    console.error('api/admin/hero/image POST error', err)
    return NextResponse.json({ error: 'DB error' }, { status: 500 })
  }
}

export async function PATCH(req: Request) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const body = await parseJsonObject(req)
    const id = readNumber(body, 'id', { required: true, integer: true, min: 1 })
    const set_featured = readBoolean(body, 'set_featured')
    const sort_order = readNumber(body, 'sort_order', { integer: true })
    const alt = readString(body, 'alt', { maxLength: 255, allowEmpty: true })
    const url = readString(body, 'url', { maxLength: 2048, allowEmpty: true })
    const r = await query<Record<string, unknown>[]>('SELECT * FROM hero_image WHERE id = ?', [id])
    if (!r || r.length === 0) return NextResponse.json({ error: 'not found' }, { status: 404 })
    const row = r[0]
    if (set_featured) {
      await transaction(async (conn) => {
        await conn.execute('UPDATE hero_image SET is_featured = 0 WHERE hero_id = ?', [Number((row as Record<string, unknown>).hero_id || 0)])
        await conn.execute('UPDATE hero_image SET is_featured = 1 WHERE id = ?', [Number(id)])
      })
    }
    if (sort_order !== undefined) {
      await query('UPDATE hero_image SET sort_order = ? WHERE id = ?', [sort_order, id])
    }
    if (alt !== undefined) {
      await query('UPDATE hero_image SET alt = ? WHERE id = ?', [String(alt || ''), id])
    }
    if (url !== undefined) {
      await query('UPDATE hero_image SET url = ? WHERE id = ?', [String(url || ''), id])
    }
    const images = await query<Record<string, unknown>[]>('SELECT * FROM hero_image WHERE hero_id = ? ORDER BY is_featured DESC, sort_order ASC', [row.hero_id])
    return NextResponse.json({ images })
  } catch (err: unknown) {
    const validationResponse = validationErrorResponse(err)
    if (validationResponse) return validationResponse
    console.error('api/admin/hero/image PATCH error', err)
    return NextResponse.json({ error: 'DB error' }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const url = new URL(req.url)
    const id = url.searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
    const r = await query<Record<string, unknown>[]>('SELECT * FROM hero_image WHERE id = ?', [Number(id)])
    if (!r || r.length === 0) return NextResponse.json({ error: 'not found' }, { status: 404 })
    const row = r[0]
    const hero_id = row.hero_id
    const urlVal = row.url

    try {
      const objectKey = resolveObjectKeyFromReference(urlVal)
      const variantsRaw = row.variants
      let variants: Record<string, unknown> | null = null
      try { variants = variantsRaw ? (typeof variantsRaw === 'string' ? JSON.parse(variantsRaw) : variantsRaw as Record<string, unknown>) : null } catch { variants = null }
      await archiveDeletedContent({ contentType: 'hero_image', originalId: Number(id), slug: String(hero_id || id), snapshot: row, objectReferences: [objectKey, ...(variants ? Object.values(variants) : [])], deletedBy: admin.email })
      if (objectKey) await deleteObjectStrict(objectKey)
      if (variants && typeof variants === 'object') {
        await Promise.all(Object.values(variants).map((value) => deleteObjectStrict(value)))
      }
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
    }

    await query('DELETE FROM hero_image WHERE id = ?', [Number(id)])
    const images = await query<Record<string, unknown>[]>('SELECT * FROM hero_image WHERE hero_id = ? ORDER BY is_featured DESC, sort_order ASC', [hero_id])
    return NextResponse.json({ images })
  } catch (err: unknown) {
    console.error('api/admin/hero/image DELETE error', err)
    return NextResponse.json({ error: 'DB error' }, { status: 500 })
  }
}
