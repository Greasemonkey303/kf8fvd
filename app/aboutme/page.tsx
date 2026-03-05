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
    const rows = await query<any[]>(`SELECT id, slug, title, content, metadata, is_published, updated_at FROM pages WHERE slug LIKE ? AND is_published = 1 ORDER BY updated_at DESC`, ['about%'])
    if (!rows || rows.length === 0) return <About />

    // prefer the canonical `about` page as the primary source
    const primary = rows.find(r => String(r.slug) === 'about') || rows[0]

    const dom = new JSDOM('')
    const DOMPurify = createDOMPurify(dom.window as any)
    const sanitize = (s: any) => { if (!s) return ''; return DOMPurify.sanitize(String(s)) }

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
      mergedCards = primaryMeta.cards.map((c: any) => ({
        title: c?.title || '', subtitle: c?.subtitle || '', content: sanitize(c?.content || ''), image: toPublicUrl(c?.image || '/headshot.jpg'), templateLarge: c?.templateLarge || '', templateSmall: c?.templateSmall || ''
      }))
    } else {
      // fallback to legacy named cards on the primary page
      const aboutCard = primaryMeta?.aboutCard || {}
      const topo = primaryMeta?.topologyCard || {}
      const shack = primaryMeta?.hamshackCard || {}
      mergedCards = [
        { title: aboutCard.title || primary.title || 'About Me', subtitle: aboutCard.subtitle || 'KF8FVD', content: sanitize(aboutCard.content || primary.content || ''), image: toPublicUrl(aboutCard.image || '/headshot.jpg'), templateLarge: aboutCard.templateLarge || '', templateSmall: aboutCard.templateSmall || '' },
        { title: topo.title || 'Home Topology', subtitle: topo.subtitle || 'Hidden Lakes Apartments, Kentwood', content: sanitize(topo.content || ''), image: toPublicUrl(topo.image || '/apts.jpg'), templateLarge: topo.templateLarge || '', templateSmall: topo.templateSmall || '' },
        { title: shack.title || 'Ham Shack', subtitle: shack.subtitle || 'Home Radio & Workshop', content: sanitize(shack.content || ''), image: toPublicUrl(shack.image || '/hamshack.jpg'), templateLarge: shack.templateLarge || '', templateSmall: shack.templateSmall || '' }
      ]
    }

    // Merge in any additional about-* pages (append their aboutCard or cards)
    for (const row of rows) {
      if (!row || String(row.slug) === String(primary.slug)) continue
      let otherMeta: any = {}
      try { otherMeta = row.metadata ? (typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata) : {} } catch { otherMeta = {} }
      if (Array.isArray(otherMeta?.cards) && otherMeta.cards.length) {
        for (const c of otherMeta.cards) mergedCards.push({ title: c?.title || '', subtitle: c?.subtitle || '', content: sanitize(c?.content || ''), image: toPublicUrl(c?.image || '/headshot.jpg'), templateLarge: c?.templateLarge || '', templateSmall: c?.templateSmall || '' })
      } else if (otherMeta?.aboutCard) {
        const c = otherMeta.aboutCard
        mergedCards.push({ title: c?.title || row.title || '', subtitle: c?.subtitle || '', content: sanitize(c?.content || ''), image: toPublicUrl(c?.image || '/headshot.jpg'), templateLarge: c?.templateLarge || '', templateSmall: c?.templateSmall || '' })
      }
    }

    const data = {
      summary: {
        title: primary.title || primaryMeta?.summary?.title || "Hi — I\'m Zachary (KF8FVD)",
        text: sanitize(primaryMeta?.summary?.text || ''),
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