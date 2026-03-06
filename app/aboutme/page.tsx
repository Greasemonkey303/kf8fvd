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
    const rows = await query<any[]>(`SELECT id, slug, title, content, metadata, is_published, updated_at FROM pages WHERE is_published = 1 ORDER BY updated_at DESC`)
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
    const DOMPurify = createDOMPurify(dom.window as any)
    const sanitize = (s: any) => { if (!s) return ''; return DOMPurify.sanitize(String(s)) }
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
    let primaryMeta: any = {}
    try { primaryMeta = primary.metadata ? (typeof primary.metadata === 'string' ? JSON.parse(primary.metadata) : primary.metadata) : {} } catch { primaryMeta = {} }

    // helper: convert presigned S3/MinIO URLs to proxied API GET (same-origin)
    const toPublicUrl = (p: any) => {
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
    let mergedCards: any[] = []
    if (Array.isArray(primaryMeta?.cards) && primaryMeta.cards.length) {
      mergedCards = primaryMeta.cards.map((c: any) => {
        const content = sanitize(c?.content || '')
        const cleaned = removeDebugBlock(content)
        const pos = (c && typeof c.position === 'number') ? c.position : undefined
        return { title: c?.title || '', subtitle: c?.subtitle || '', content: cleaned, image: toPublicUrl(c?.image || '/headshot.jpg'), templateLarge: c?.templateLarge || '', templateSmall: c?.templateSmall || '', position: pos }
      })
    } else if (primaryMeta?.aboutCard) {
      // Backwards-compatible: if primary page uses legacy aboutCard, include it
      const c = primaryMeta.aboutCard
      const content = sanitize(c?.content || '')
      const cleaned = removeDebugBlock(content)
      const pos = (c && typeof c.position === 'number') ? c.position : undefined
      mergedCards.push({ title: c?.title || primary.title || '', subtitle: c?.subtitle || '', content: cleaned, image: toPublicUrl(c?.image || '/headshot.jpg'), templateLarge: c?.templateLarge || '', templateSmall: c?.templateSmall || '', position: pos })
    }

    // Merge in any additional about-* pages (append their aboutCard or cards)
    for (const row of rows) {
      if (!row || String(row.slug) === String(primary.slug)) continue
      let otherMeta: any = {}
      try { otherMeta = row.metadata ? (typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata) : {} } catch { otherMeta = {} }
      if (Array.isArray(otherMeta.cards) && otherMeta.cards.length) {
        for (const c of otherMeta.cards) {
          const content = sanitize(c?.content || '')
          const cleaned = removeDebugBlock(content)
          const pos = (c && typeof c.position === 'number') ? c.position : undefined
          mergedCards.push({ title: c?.title || '', subtitle: c?.subtitle || '', content: cleaned, image: toPublicUrl(c?.image || '/headshot.jpg'), templateLarge: c?.templateLarge || '', templateSmall: c?.templateSmall || '', position: pos })
        }
      } else if (otherMeta?.aboutCard) {
        const c = otherMeta.aboutCard
        const content = sanitize(c?.content || '')
        const cleaned = removeDebugBlock(content)
        const pos = (c && typeof c.position === 'number') ? c.position : undefined
        mergedCards.push({ title: c?.title || row.title || '', subtitle: c?.subtitle || '', content: cleaned, image: toPublicUrl(c?.image || '/headshot.jpg'), templateLarge: c?.templateLarge || '', templateSmall: c?.templateSmall || '', position: pos })
      }
    }

    // If any cards have explicit positions, sort by them; otherwise preserve current merge order
    mergedCards.sort((a: any, b: any) => {
      const pa = (typeof a.position === 'number') ? a.position : null
      const pb = (typeof b.position === 'number') ? b.position : null
      if (pa !== null && pb !== null) return pa - pb
      if (pa !== null) return -1
      if (pb !== null) return 1
      return 0
    })

    let summaryText = sanitize(primaryMeta?.summary?.text || '')
    summaryText = removeDebugBlock(summaryText)
    if (isJsonString(summaryText)) summaryText = ''

    const data = {
      summary: {
        title: primary.title || primaryMeta?.summary?.title || "Hi — I\'m Zachary (KF8FVD)",
        text: summaryText,
        cta: {
          label: primaryMeta?.summary?.cta?.label || 'Contact Me',
          href: primaryMeta?.summary?.cta?.href || '/contactme'
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