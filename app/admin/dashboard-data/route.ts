import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { query } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const [projectRows, userRows, messageRows, recentMessages, pageRows] = await Promise.all([
    query<{ total: number }[]>('SELECT COUNT(*) as total FROM projects'),
    query<{ total: number }[]>('SELECT COUNT(*) as total FROM users'),
    query<{ total: number; unread: number }[]>('SELECT COUNT(*) as total, SUM(CASE WHEN is_deleted=0 AND is_read=0 THEN 1 ELSE 0 END) as unread FROM messages WHERE is_deleted=0'),
    query<Array<Record<string, unknown>>>('SELECT id, name, email, message, is_read, created_at FROM messages WHERE is_deleted=0 ORDER BY created_at DESC LIMIT 5'),
    query<Array<{ metadata?: string | null }>>('SELECT metadata FROM pages')
  ])

  let aboutPosts = 0
  try {
    for (const row of pageRows || []) {
      try {
        const metadata = row.metadata ? JSON.parse(String(row.metadata)) : null
        if (!metadata) continue
        if (Array.isArray(metadata.cards) && metadata.cards.length > 0) aboutPosts += metadata.cards.length
        else {
          if (metadata.aboutCard) aboutPosts++
          if (metadata.topologyCard) aboutPosts++
          if (metadata.hamshackCard) aboutPosts++
        }
      } catch (e) {
        void e
      }
    }
  } catch (e) {
    void e
  }

  const counts = {
    projects: projectRows?.[0]?.total ?? 0,
    users: userRows?.[0]?.total ?? 0,
    messages: messageRows?.[0]?.total ?? 0,
    unreadMessages: Number(messageRows?.[0]?.unread ?? 0),
    aboutPosts,
  }

  return NextResponse.json({ counts, recentMessages: recentMessages || [] }, { headers: { 'Cache-Control': 'no-store' } })
}