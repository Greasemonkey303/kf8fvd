import { NextResponse } from 'next/server'
import { query } from '../../../lib/db'

export async function GET() {
  try {
    const rows = await query(`SELECT id, section, slug, s3_prefix, title, tag, authority, image_path, description, metadata, is_published, sort_order FROM credentials WHERE is_published = 1 ORDER BY sort_order ASC, updated_at DESC`)
    // group by section (by slug)
    const grouped: Record<string, any[]> = {}
    ;(rows as any[] || []).forEach(r => {
      const sec = r.section || 'General'
      if (!grouped[sec]) grouped[sec] = []
      grouped[sec].push(r)
    })

    // fetch section metadata (name, subtitle) where available
    const metaRows = await query(`SELECT slug, name, subtitle FROM credential_sections ORDER BY sort_order ASC`)
    const metaMap: Record<string, any> = {}
    ;(metaRows as any[] || []).forEach(m => { if (m && m.slug) metaMap[m.slug] = { name: m.name, subtitle: m.subtitle } })

    return NextResponse.json({ sections: grouped, section_meta: metaMap })
  } catch (err: unknown) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
