import React from 'react'
import About from '@/containers/about/about'
import { query } from '@/lib/db'
import { JSDOM } from 'jsdom'
import createDOMPurify from 'dompurify'

export const metadata = {
  title: 'About — KF8FVD',
  description: 'About Zachary (KF8FVD) — ham radio operator, maker, and technician in Kentwood, MI.',
  openGraph: { images: ['/apts.jpg'], title: 'About — KF8FVD' }
}

export default async function Page() {
  try {
    const rows = await query<any[]>(`SELECT id, slug, title, content, metadata, is_published FROM pages WHERE slug = ? LIMIT 1`, ['about'])
    if (!rows || rows.length === 0) {
      return <About />
    }

    const page = rows[0]
    let metadataObj: any = {}
    try { metadataObj = page.metadata ? JSON.parse(page.metadata) : {} } catch { metadataObj = {} }

    const dom = new JSDOM('')
    const DOMPurify = createDOMPurify(dom.window as any)
    const sanitize = (s: any) => { if (!s) return ''; return DOMPurify.sanitize(String(s)) }

    // If a `cards` array exists in metadata, prefer that flexible structure.
    const cards = Array.isArray(metadataObj?.cards) && metadataObj.cards.length > 0 ? metadataObj.cards.map((c: any) => ({
      title: c?.title || '',
      subtitle: c?.subtitle || '',
      content: sanitize(c?.content || ''),
      image: c?.image || '/headshot.jpg'
    })) : null

    const data = {
      summary: {
        title: page.title || metadataObj?.summary?.title || "Hi — I\'m Zachary (KF8FVD)",
        text: sanitize(metadataObj?.summary?.text || ''),
        cta: {
          label: metadataObj?.summary?.cta?.label || 'Contact Me',
          href: metadataObj?.summary?.cta?.href || '/contactme'
        }
      },
      // prefer cards array when present for flexible layouts; otherwise fall back to legacy keys
      ...(cards ? { cards } : {
        aboutCard: {
          title: metadataObj?.aboutCard?.title || 'About Me',
          subtitle: metadataObj?.aboutCard?.subtitle || 'KF8FVD',
          content: sanitize(metadataObj?.aboutCard?.content || page.content || ''),
          image: metadataObj?.aboutCard?.image || '/headshot.jpg'
        },
        topologyCard: {
          title: metadataObj?.topologyCard?.title || 'Home Topology',
          subtitle: metadataObj?.topologyCard?.subtitle || 'Hidden Lakes Apartments, Kentwood',
          content: sanitize(metadataObj?.topologyCard?.content || ''),
          image: metadataObj?.topologyCard?.image || '/apts.jpg'
        },
        hamshackCard: {
          title: metadataObj?.hamshackCard?.title || 'Ham Shack',
          subtitle: metadataObj?.hamshackCard?.subtitle || 'Home Radio & Workshop',
          content: sanitize(metadataObj?.hamshackCard?.content || ''),
          image: metadataObj?.hamshackCard?.image || '/hamshack.jpg'
        }
      })
    }

    return <About data={data} />
  } catch (err) {
    return <About />
  }
}