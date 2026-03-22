import React from 'react'
import About from '@/containers/about/about'
import { query } from '@/lib/db'
import { JSDOM } from 'jsdom'
import { buildPublicUrl } from '@/lib/s3'
import createDOMPurify from 'dompurify'

export const metadata = {
  title: 'About — KF8FVD',
  description: 'About Zachary (KF8FVD) — ham radio operator, maker, and technician in Kentwood, MI.',
  openGraph: { images: ['/apts.jpg'], title: 'About — KF8FVD' }
}

export default async function Page() {
  try {
    // Load all pages whose slug starts with "about" so we can merge any
    // standalone about-* pages into the main About page's cards (helps when
    // admins create sub-pages like `about-me-server`). This mirrors how the
    // Projects list loads multiple records.
    // Only include published pages so toggling "Published" in admin hides sections from the public site.
    // Include all published pages (do not restrict by slug) so sections aren't filtered out
    const rows = await query<Record<string, unknown>[]>(`SELECT id, slug, title, content, metadata, is_published, updated_at FROM pages WHERE is_published = 1 ORDER BY updated_at DESC`)
    if (!rows || rows.length === 0) {
      const data = {
        summary: {
          title: "Hi — I'm Zachary (KF8FVD)",
          text: '',
          cta: { label: 'Contact Me', href: '/contactme' }
        },
        cards: []
      }
      return <About data={data} />
    }

    // prefer the canonical `about` page as the primary source
    const primary = rows.find(r => String(r.slug) === 'about') || rows[0]

    const dom = new JSDOM('')
    const DOMPurify = createDOMPurify(dom.window as unknown as Window & typeof globalThis)
    if (DOMPurify && typeof (DOMPurify as any).setConfig === 'function') (DOMPurify as any).setConfig({ FORBID_TAGS: ['script', 'style'] })
    const sanitize = (s: unknown) => { if (!s) return ''; return DOMPurify.sanitize(String(s)) }
    const isJsonString = (s: string) => {
      if (!s) return false
      try { JSON.parse(s); return true } catch { return false }
    }

    const removeDebugBlock = (s: string | undefined) => {
      if (!s) return ''
      let raw = String(s)
      // Remove a known debug block that starts with an "About Me" <h3>
      // and ends with the signature line "73, Zachary (KF8FVD)</p>"
      try {
        const re = /<h3[^>]*>\s*About\s*Me\s*<\/h3>[\s\S]*?73,\s*Zachary\s*\(KF8FVD\)\s*<\/p>/i
        if (re.test(raw)) raw = raw.replace(re, '')
      } catch {
        // ignore regex issues
      }
      return raw
    }

    // Parse primary metadata
    type AboutCard = { title?: string; subtitle?: string; content?: string; image?: string; templateLarge?: string; templateSmall?: string; position?: number }
    let primaryMeta: Record<string, unknown> = {}
    try { primaryMeta = primary.metadata ? (typeof primary.metadata === 'string' ? JSON.parse(primary.metadata) : primary.metadata) : {} } catch { primaryMeta = {} }

    // helper: convert presigned S3/MinIO URLs to proxied API GET (same-origin)
    const toPublicUrl = (p: unknown) => {
      if (!p) return '/headshot.jpg'
      const s = String(p)
      if (s.indexOf('X-Amz-Algorithm') !== -1 || s.indexOf('minio') !== -1 || s.indexOf('127.0.0.1') !== -1 || s.indexOf('amazonaws.com') !== -1) {
        try {
          const u = new URL(s)
          let path = u.pathname.replace(/^\//, '')
          const bucket = process.env.NEXT_PUBLIC_S3_BUCKET
          if (bucket && path.startsWith(bucket + '/')) path = path.slice(bucket.length + 1)
          return buildPublicUrl(path)
        } catch {
          return s
        }
      }
      return s
    }

    // Start with any cards defined on the primary page (preferred)
    let mergedCards: AboutCard[] = []
    if (Array.isArray(primaryMeta?.cards) && (primaryMeta.cards as unknown[]).length) {
      mergedCards = (primaryMeta.cards as unknown[]).map((c: unknown) => {
        const card = c as Record<string, unknown>
        const content = sanitize(card['content'] ?? '')
        const cleaned = removeDebugBlock(content)
        const pos = typeof card['position'] === 'number' ? (card['position'] as number) : undefined
        return { title: String(card['title'] ?? ''), subtitle: String(card['subtitle'] ?? ''), content: cleaned, image: toPublicUrl(card['image'] ?? '/headshot.jpg'), templateLarge: String(card['templateLarge'] ?? ''), templateSmall: String(card['templateSmall'] ?? ''), position: pos }
      })
    } else if (primaryMeta?.aboutCard) {
      // Backwards-compatible: if primary page uses legacy aboutCard, include it
      const c = primaryMeta.aboutCard as Record<string, unknown>
      const content = sanitize(c['content'] ?? '')
      const cleaned = removeDebugBlock(content)
      const pos = typeof c['position'] === 'number' ? (c['position'] as number) : undefined
      mergedCards.push({ title: String(c['title'] ?? primary.title ?? ''), subtitle: String(c['subtitle'] ?? ''), content: cleaned, image: toPublicUrl(c['image'] ?? '/headshot.jpg'), templateLarge: String(c['templateLarge'] ?? ''), templateSmall: String(c['templateSmall'] ?? ''), position: pos })
    }

    // Merge in any additional about-* pages (append their aboutCard or cards)
    for (const row of rows) {
      if (!row || String(row.slug) === String(primary.slug)) continue
      let otherMeta: Record<string, unknown> = {}
      try { otherMeta = row.metadata ? (typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata) : {} } catch { otherMeta = {} }
      if (Array.isArray(otherMeta['cards']) && (otherMeta['cards'] as unknown[]).length) {
        for (const c of otherMeta['cards'] as unknown[]) {
          const card = c as Record<string, unknown>
          const content = sanitize(card['content'] ?? '')
          const cleaned = removeDebugBlock(content)
          const pos = typeof card['position'] === 'number' ? (card['position'] as number) : undefined
          mergedCards.push({ title: String(card['title'] ?? ''), subtitle: String(card['subtitle'] ?? ''), content: cleaned, image: toPublicUrl(card['image'] ?? '/headshot.jpg'), templateLarge: String(card['templateLarge'] ?? ''), templateSmall: String(card['templateSmall'] ?? ''), position: pos })
        }
      } else if (otherMeta['aboutCard']) {
        const c = otherMeta['aboutCard'] as Record<string, unknown>
        const content = sanitize(c['content'] ?? '')
        const cleaned = removeDebugBlock(content)
        const pos = typeof c['position'] === 'number' ? (c['position'] as number) : undefined
        mergedCards.push({ title: String(c['title'] ?? row.title ?? ''), subtitle: String(c['subtitle'] ?? ''), content: cleaned, image: toPublicUrl(c['image'] ?? '/headshot.jpg'), templateLarge: String(c['templateLarge'] ?? ''), templateSmall: String(c['templateSmall'] ?? ''), position: pos })
      }
    }

    // If any cards have explicit positions, sort by them; otherwise preserve current merge order
    mergedCards.sort((a, b) => {
      const pa = (typeof a.position === 'number') ? a.position : null
      const pb = (typeof b.position === 'number') ? b.position : null
      if (pa !== null && pb !== null) return pa - pb
      if (pa !== null) return -1
      if (pb !== null) return 1
      return 0
    })

    let summaryText = sanitize(String((primaryMeta?.summary as Record<string, unknown>)?.['text'] || ''))
    summaryText = removeDebugBlock(summaryText)
    if (isJsonString(summaryText)) summaryText = ''

    const data = {
      summary: {
        title: String(((primary as Record<string, unknown>)['title']) || ((primaryMeta?.summary as Record<string, unknown>)?.['title']) || "Hi - I\'m Zachary (KF8FVD)"),
        text: summaryText,
        cta: {
          label: String(((primaryMeta?.summary as Record<string, unknown>)?.['cta'] as Record<string, unknown>)?.['label'] || 'Contact Me'),
          href: String(((primaryMeta?.summary as Record<string, unknown>)?.['cta'] as Record<string, unknown>)?.['href'] || '/contactme')
        }
      },
      // prefer cards array (merged from primary + any about-* pages)
      cards: mergedCards
    }

    return <About data={data} />
  } catch (err) {
    return <About />
  }
}