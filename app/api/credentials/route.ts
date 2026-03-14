import { NextResponse } from 'next/server'
import { query } from '../../../lib/db'

type CredentialRow = {
  id: number
  section?: string
  slug?: string
  s3_prefix?: string
  title?: string
  tag?: string
  authority?: string
  image_path?: string
  description?: string
  metadata?: string | Record<string, unknown>
  is_published?: number
  sort_order?: number
}

type SectionMetaRow = { slug?: string; name?: string; subtitle?: string }

export async function GET() {
  try {
    const rows = (await query(`SELECT id, section, slug, s3_prefix, title, tag, authority, image_path, description, metadata, is_published, sort_order FROM credentials WHERE is_published = 1 ORDER BY sort_order ASC, updated_at DESC`)) as CredentialRow[]
    // group by section (by slug)
    const grouped: Record<string, CredentialRow[]> = {}
    ;(rows || []).forEach(r => {
      const sec = r.section || 'General'
      if (!grouped[sec]) grouped[sec] = []
      grouped[sec].push(r)
    })

    // fetch section metadata (name, subtitle) where available
    const metaRows = (await query(`SELECT slug, name, subtitle FROM credential_sections ORDER BY sort_order ASC`)) as SectionMetaRow[]
    const metaMap: Record<string, { name?: string; subtitle?: string }> = {}
    ;(metaRows || []).forEach(m => { if (m && m.slug) metaMap[m.slug] = { name: m.name, subtitle: m.subtitle } })

    return NextResponse.json({ sections: grouped, section_meta: metaMap })
  } catch (err: unknown) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
