import React from 'react'
import About from '@/containers/about/about'
import { query } from '@/lib/db'
import { JSDOM } from 'jsdom'
import { buildPublicUrl } from '@/lib/s3'
import { getSiteMediaUrl, replaceLegacyBundledImagePath } from '@/lib/siteMedia'
import createDOMPurify from 'dompurify'
import { buildPublicAboutCards, pickPrimaryAboutRow } from '@/lib/aboutSections'

type DomPurifyWithConfig = ReturnType<typeof createDOMPurify> & {
  setConfig?: (config: { FORBID_TAGS: string[] }) => void
}

export const metadata = {
  title: 'About — KF8FVD',
  description: 'About Zachary (KF8FVD) — ham radio operator, maker, and technician in Kentwood, MI.',
  openGraph: { images: [getSiteMediaUrl('aboutTopology')], title: 'About — KF8FVD' }
}

export default async function Page() {
  try {
    // Load published pages and reduce them to the canonical public About sections.
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

    const primary = pickPrimaryAboutRow(rows)
    if (!primary) return <About />

    const dom = new JSDOM('')
    const DOMPurify = createDOMPurify(dom.window as unknown as Window & typeof globalThis)
    const configuredPurifier = DOMPurify as DomPurifyWithConfig
    if (typeof configuredPurifier.setConfig === 'function') configuredPurifier.setConfig({ FORBID_TAGS: ['script', 'style'] })
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
      if (!p) return ''
      const s = String(p)
      const mapped = replaceLegacyBundledImagePath(s)
      if (mapped !== s) return mapped
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
      if (!s.startsWith('/') && !/^https?:\/\//i.test(s)) return buildPublicUrl(s)
      return s
    }

    const mergedCards: AboutCard[] = buildPublicAboutCards(rows).map((card) => {
      const content = sanitize(card.content ?? '')
      const cleaned = removeDebugBlock(content)
      return {
        title: String(card.title ?? ''),
        subtitle: String(card.subtitle ?? ''),
        content: cleaned,
        image: toPublicUrl(card.image ?? ''),
        templateLarge: '',
        templateSmall: '',
        position: card.position,
      }
    })

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
  } catch {
    return <About />
  }
}