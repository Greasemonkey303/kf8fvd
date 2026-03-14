import { NextResponse } from 'next/server'
import { query } from '@/lib/db'

export async function GET() {
  try {
    const heroes = await query<Record<string, unknown>[]>('SELECT * FROM hero ORDER BY id ASC LIMIT 1')
    const hero = Array.isArray(heroes) && heroes.length > 0 ? heroes[0] : null
    if (!hero) return NextResponse.json({ hero: null, images: [] })
    const images = await query<Record<string, unknown>[]>('SELECT * FROM hero_image WHERE hero_id = ? ORDER BY is_featured DESC, sort_order ASC', [hero.id])
    return NextResponse.json({ hero, images })
  } catch (err: unknown) {
    // eslint-disable-next-line no-console
    console.error('api/hero error', err)
    return NextResponse.json({ error: 'DB error' }, { status: 500 })
  }
}
