import { NextResponse } from 'next/server'
import { requireAdmin } from '../../../../lib/auth'
import { query } from '../../../../lib/db'
import { marked } from 'marked'
import createDOMPurify from 'dompurify'
import { JSDOM } from 'jsdom'
import { deleteObjectsStrict, deletePrefixStrict, resolveObjectKeyFromReference } from '@/lib/objectStorage'

type DomPurifyWithConfig = ReturnType<typeof createDOMPurify> & {
  setConfig?: (config: { FORBID_TAGS: string[] }) => void
}

const getErrMsg = (err: unknown) => {
  if (err instanceof Error) return err.message
  try { return String(err) } catch { return 'Unknown error' }
}

// Remove known debug HTML block inserted during earlier testing
const removeDebugBlockFromHtml = (s: unknown) => {
  if (!s) return s
  try {
    const raw = String(s)
    const re = /<h3[^>]*>\s*About\s*Me\s*<\/h3>[\s\S]*?73,\s*Zachary\s*\(KF8FVD\)\s*<\/p>/gi
    return raw.replace(re, '')
  } catch {
    return s
  }
}

const isProbablyHtml = (value: string) => /<\/?[a-z][\s\S]*>/i.test(value)

async function sanitizePageContent(content: unknown, purifier: DomPurifyWithConfig) {
  const raw = String(content ?? '').trim()
  if (!raw) return null
  const rendered = isProbablyHtml(raw) ? raw : await Promise.resolve(marked.parse(raw))
  return purifier.sanitize(typeof rendered === 'string' ? rendered : '')
}

export async function GET(req: Request) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const url = new URL(req.url)
  const page = Math.max(parseInt(url.searchParams.get('page') || '1', 10), 1)
  const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') || '20', 10), 1), 100)
  const offset = (page - 1) * limit
  // Some MySQL setups don't accept prepared params for LIMIT/OFFSET; inline integers after sanitizing
  const safeLimit = Number.isFinite(limit) ? limit : 20
  const safeOffset = Number.isFinite(offset) ? offset : 0
  const rows = await query<{ id: number; slug: string; title: string; content?: string | null; metadata?: string | null; is_published: number; updated_at: string }[]>(`SELECT id, slug, title, content, metadata, is_published, updated_at FROM pages ORDER BY updated_at DESC LIMIT ${safeLimit} OFFSET ${safeOffset}`)
  const countRows = await query<{ total: number }[]>('SELECT COUNT(*) as total FROM pages')
  const total = countRows?.[0]?.total ?? 0
  return NextResponse.json({ items: rows, page, limit, total })
}

export async function POST(req: Request) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json()
  const { slug, title, content, metadata, is_published } = body
  if (!slug || !title) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  // Sanitize content server-side before saving
  const { window } = new JSDOM('')
  const DOMPurify = createDOMPurify(window as unknown as Window & typeof globalThis)
  const configuredPurifier = DOMPurify as DomPurifyWithConfig
  if (typeof configuredPurifier.setConfig === 'function') configuredPurifier.setConfig({ FORBID_TAGS: ['script', 'style'] })
  let sanitized = await sanitizePageContent(content, configuredPurifier)
  if (sanitized) sanitized = String(removeDebugBlockFromHtml(sanitized))
  // sanitize known metadata HTML fields to avoid storing unsafe markup
  let safeMetadata: Record<string, unknown> = metadata ? { ...metadata } : {}
    try {
    if ((safeMetadata['summary'] as Record<string, unknown>)?.text) (safeMetadata['summary'] as Record<string, unknown>).text = removeDebugBlockFromHtml(DOMPurify.sanitize(String((safeMetadata['summary'] as Record<string, unknown>).text)))
    // If authors are using a cards array, sanitize each card's title, subtitle, and content
    if (Array.isArray(safeMetadata?.cards)) {
      safeMetadata.cards = (safeMetadata.cards as unknown[]).map((c: unknown) => {
        if (!c || typeof c !== 'object') return c
        const copy = { ...(c as Record<string, unknown>) } as Record<string, unknown>
        if (copy.title) copy.title = DOMPurify.sanitize(String(copy.title))
        if (copy.subtitle) copy.subtitle = DOMPurify.sanitize(String(copy.subtitle))
        if (copy.content) copy.content = removeDebugBlockFromHtml(DOMPurify.sanitize(String(copy.content)))
        return copy
      })
    } else {
      // Backwards compatible: sanitize old-style named cards
      if ((safeMetadata['aboutCard'] as Record<string, unknown>)?.content) (safeMetadata['aboutCard'] as Record<string, unknown>).content = removeDebugBlockFromHtml(DOMPurify.sanitize(String((safeMetadata['aboutCard'] as Record<string, unknown>).content)))
      if ((safeMetadata['topologyCard'] as Record<string, unknown>)?.content) (safeMetadata['topologyCard'] as Record<string, unknown>).content = removeDebugBlockFromHtml(DOMPurify.sanitize(String((safeMetadata['topologyCard'] as Record<string, unknown>).content)))
      if ((safeMetadata['hamshackCard'] as Record<string, unknown>)?.content) (safeMetadata['hamshackCard'] as Record<string, unknown>).content = removeDebugBlockFromHtml(DOMPurify.sanitize(String((safeMetadata['hamshackCard'] as Record<string, unknown>).content)))
    }
  } catch (e) {
    void e
    safeMetadata = metadata ? { ...metadata } : {}
  }

  try {
    // If a page with this slug already exists, update it instead of inserting to avoid accidental duplicates
    const existing = await query<{ id: number }[]>('SELECT id FROM pages WHERE slug = ?', [slug])
    if (existing && existing.length > 0) {
      const existingId = existing[0].id
      await query('UPDATE pages SET title = ?, content = ?, metadata = ?, is_published = ? WHERE id = ?', [title, sanitized || null, safeMetadata ? JSON.stringify(safeMetadata) : JSON.stringify({}), is_published ? 1 : 0, existingId])
      return NextResponse.json({ id: existingId, ok: true, updated: true })
    }

    const insertRes = await query('INSERT INTO pages (slug, title, content, metadata, is_published) VALUES (?, ?, ?, ?, ?)', [slug, title, sanitized || null, safeMetadata ? JSON.stringify(safeMetadata) : JSON.stringify({}), is_published ? 1 : 0])
    const insertId = (insertRes as unknown as { insertId?: number })?.insertId ?? null
    return NextResponse.json({ id: insertId, ok: true })
  } catch (e: unknown) {
    // handle duplicate-slug by merging metadata into existing page
    const errObj = e as unknown
    // If concurrent insertion caused a duplicate entry, try to merge/patch existing page as a fallback
    const dup = (typeof errObj === 'object' && errObj !== null && ((errObj as Record<string, unknown>)['code'] === 'ER_DUP_ENTRY')) || String(e).toLowerCase().includes('duplicate')
    if (dup) {
      try {
        const rows = await query<{ id: number; metadata?: string }[]>('SELECT id, metadata FROM pages WHERE slug = ?', [slug])
        if (rows && rows.length > 0) {
          const existing = rows[0]
          let meta: Record<string, unknown> = {}
          try { meta = existing.metadata ? (typeof existing.metadata === 'string' ? JSON.parse(existing.metadata) : existing.metadata) : {} } catch { meta = {} }

          // Fallback: append any new cards if safeMetadata contains them
          if (Array.isArray(safeMetadata?.cards) && safeMetadata.cards.length) {
            meta.cards = Array.isArray(meta.cards) ? meta.cards.concat(safeMetadata.cards) : safeMetadata.cards.slice()
          } else if (safeMetadata?.aboutCard) {
            const newCard = safeMetadata.aboutCard
            if (!Array.isArray(meta.cards)) {
              const converted: Record<string, unknown>[] = []
              if ((meta as Record<string, unknown>)['aboutCard']) converted.push((meta as Record<string, unknown>)['aboutCard'] as Record<string, unknown>)
              if ((meta as Record<string, unknown>)['topologyCard']) converted.push((meta as Record<string, unknown>)['topologyCard'] as Record<string, unknown>)
              if ((meta as Record<string, unknown>)['hamshackCard']) converted.push((meta as Record<string, unknown>)['hamshackCard'] as Record<string, unknown>)
              meta.cards = converted
            }
            ;(meta.cards as unknown[]).push(newCard as unknown)
            delete meta.aboutCard; delete meta.topologyCard; delete meta.hamshackCard
          }

          await query('UPDATE pages SET metadata = ? WHERE id = ?', [JSON.stringify(meta), existing.id])
          return NextResponse.json({ id: existing.id, ok: true, merged: true })
        }
      } catch (ee) {
        return NextResponse.json({ error: getErrMsg(ee) }, { status: 500 })
      }
    }
    return NextResponse.json({ error: getErrMsg(e) }, { status: 500 })
  }

}

export async function PUT(req: Request) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json()
  const { id, slug, title, content, metadata, is_published } = body
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })
  // Sanitize content server-side before saving
  const { window } = new JSDOM('')
  const DOMPurify = createDOMPurify(window as unknown as Window & typeof globalThis)
  const configuredPurifier = DOMPurify as DomPurifyWithConfig
  if (typeof configuredPurifier.setConfig === 'function') configuredPurifier.setConfig({ FORBID_TAGS: ['script', 'style'] })
  let sanitized = await sanitizePageContent(content, configuredPurifier)
  if (sanitized) sanitized = String(removeDebugBlockFromHtml(sanitized))
  // sanitize known metadata HTML fields
  let safeMetadata = metadata ? { ...metadata } : {}
    try {
    if (safeMetadata?.summary?.text) safeMetadata.summary.text = removeDebugBlockFromHtml(DOMPurify.sanitize(String(safeMetadata.summary.text)))
    // If a cards array is provided, sanitize each card entry
    if (Array.isArray(safeMetadata?.cards)) {
      safeMetadata.cards = (safeMetadata.cards as unknown[]).map((c: unknown) => {
        if (!c || typeof c !== 'object') return c
        const copy = { ...(c as Record<string, unknown>) } as Record<string, unknown>
        if (copy.title) copy.title = DOMPurify.sanitize(String(copy.title))
        if (copy.subtitle) copy.subtitle = DOMPurify.sanitize(String(copy.subtitle))
        if (copy.content) copy.content = removeDebugBlockFromHtml(DOMPurify.sanitize(String(copy.content)))
        return copy
      })
    } else {
      if (safeMetadata?.aboutCard?.content) safeMetadata.aboutCard.content = removeDebugBlockFromHtml(DOMPurify.sanitize(String(safeMetadata.aboutCard.content)))
      if (safeMetadata?.topologyCard?.content) safeMetadata.topologyCard.content = removeDebugBlockFromHtml(DOMPurify.sanitize(String(safeMetadata.topologyCard.content)))
      if (safeMetadata?.hamshackCard?.content) safeMetadata.hamshackCard.content = removeDebugBlockFromHtml(DOMPurify.sanitize(String(safeMetadata.hamshackCard.content)))
    }
  } catch (e) {
    void e
    safeMetadata = metadata ? { ...metadata } : {}
  }

  await query('UPDATE pages SET slug = ?, title = ?, content = ?, metadata = ?, is_published = ? WHERE id = ?', [slug, title, sanitized || null, safeMetadata ? JSON.stringify(safeMetadata) : JSON.stringify({}), is_published ? 1 : 0, id])
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: Request) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const url = new URL(req.url)
  const id = url.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })
  const cardParam = url.searchParams.get('card')
  // Helper to extract an S3 object key from various URL forms stored in metadata
  // If a card param was provided, attempt to remove only that card from the page metadata
  if (cardParam !== null && cardParam !== undefined) {
    // load metadata for the page
    const rows = await query<{ metadata?: string | null, slug?: string }[]>('SELECT metadata, slug FROM pages WHERE id = ?', [id])
    if (!rows || rows.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const row = rows[0]
    let meta: Record<string, unknown> = {}
    try { meta = row.metadata ? (typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata) : {} } catch { meta = {} }

    // cardParam numeric -> treat as index in meta.cards
    const numeric = parseInt(String(cardParam), 10)
    if (!Number.isNaN(numeric)) {
      const idx = numeric
      if (!Array.isArray(meta.cards) || idx < 0 || idx >= meta.cards.length) return NextResponse.json({ error: 'Invalid card index' }, { status: 400 })
      const card = meta.cards[idx]
      // collect keys referenced by this card
      const keysToDelete: string[] = []
      if (card) {
        const cardRec = card as Record<string, unknown>
        if (cardRec.image) {
          const k = resolveObjectKeyFromReference(cardRec.image)
          if (k) keysToDelete.push(k)
        }
        if (Array.isArray(cardRec.images)) {
          for (const im of cardRec.images as unknown[]) {
            const k = resolveObjectKeyFromReference(im)
            if (k) keysToDelete.push(k)
          }
        }
      }

      try {
        await deleteObjectsStrict(keysToDelete)
      } catch (e: unknown) {
        return NextResponse.json({ error: getErrMsg(e) }, { status: 500 })
      }

      // remove the card from metadata and persist
      meta.cards.splice(idx, 1)
      try {
        await query('UPDATE pages SET metadata = ? WHERE id = ?', [JSON.stringify(meta), id])
        return NextResponse.json({ ok: true })
      } catch (e: unknown) {
        return NextResponse.json({ error: getErrMsg(e) }, { status: 500 })
      }
    }

    // handle legacy named cards (about, topology, hamshack)
    const named = String(cardParam)
    if (named && (named === 'about' || named === 'topology' || named === 'hamshack')) {
      const keyName = named + 'Card'
      const card = meta[keyName]
      if (!card) return NextResponse.json({ error: 'Card not found' }, { status: 404 })
      const keysToDelete: string[] = []
      const cardRec = card as Record<string, unknown>
      if (cardRec.image) {
        const k = resolveObjectKeyFromReference(cardRec.image)
        if (k) keysToDelete.push(k)
      }
      if (Array.isArray(cardRec.images)) {
        for (const im of cardRec.images as unknown[]) {
          const k = resolveObjectKeyFromReference(im)
          if (k) keysToDelete.push(k)
        }
      }
      try {
        await deleteObjectsStrict(keysToDelete)
      } catch (e: unknown) {
        return NextResponse.json({ error: getErrMsg(e) }, { status: 500 })
      }
      // remove the named card and persist
      delete meta[keyName]
      try {
        await query('UPDATE pages SET metadata = ? WHERE id = ?', [JSON.stringify(meta), id])
        return NextResponse.json({ ok: true })
      } catch (e: unknown) {
        return NextResponse.json({ error: getErrMsg(e) }, { status: 500 })
      }
    }

    return NextResponse.json({ error: 'Invalid card parameter' }, { status: 400 })
  }

  // No card param: delete the whole page and its bucket prefix
  // Find the page to determine slug for S3 cleanup
  const rows = await query<{ slug: string }[]>('SELECT slug FROM pages WHERE id = ?', [id])
  if (!rows || rows.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const slug = rows[0].slug

  try {
    const prefix = `${process.env.S3_UPLOAD_PREFIX || 'pages/'}${slug}/`
    await deletePrefixStrict(prefix)
  } catch (e: unknown) {
    return NextResponse.json({ error: getErrMsg(e) }, { status: 500 })
  }

  await query('DELETE FROM pages WHERE id = ?', [id])
  return NextResponse.json({ ok: true })
}
