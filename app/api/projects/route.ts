import { NextResponse } from 'next/server'
import { query } from '../../../lib/db'
import { sanitizeHtmlServer } from '../../../lib/sanitize'

export async function GET(req: Request) {
  const url = new URL(req.url)
  const page = Math.max(parseInt(url.searchParams.get('page') || '1', 10), 1)
  const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') || '20', 10), 1), 100)
  const offset = (page - 1) * limit
  const safeLimit = Number.isFinite(limit) ? limit : 20
  const safeOffset = Number.isFinite(offset) ? offset : 0
  const rows = await query(`SELECT id, slug, title, subtitle, image_path, description, external_link, is_published, sort_order FROM projects WHERE is_published = 1 ORDER BY sort_order ASC, updated_at DESC LIMIT ${safeLimit} OFFSET ${safeOffset}`) as Array<Record<string, unknown>>
  // sanitize description server-side to ensure public APIs do not return raw unsafe HTML
  try {
    for (const r of rows) {
      if (r && r.description) r.description = sanitizeHtmlServer(String(r.description))
    }
  } catch (e) {
    void e
    // best-effort: if sanitization fails, leave description as-is
  }
  const totalRows = await query('SELECT COUNT(*) as total FROM projects WHERE is_published = 1') as Array<{ total: number }>
  const total = totalRows && totalRows[0] ? totalRows[0].total : 0
  return NextResponse.json({ items: rows || [], page, limit, total })
}
