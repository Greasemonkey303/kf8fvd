import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { query } from '@/lib/db'
import { completeDeletionCleanup, type DeletionArchiveResult } from '@/lib/deletionArchive'
import { deleteObjectsStrict } from '@/lib/objectStorage'

type PendingCleanupRow = {
  id: number
  original_object_keys?: string | string[] | null
}

function parseObjectKeys(value: PendingCleanupRow['original_object_keys']) {
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value
    return Array.isArray(parsed) ? parsed.filter((key): key is string => typeof key === 'string' && key.length > 0) : []
  } catch {
    return []
  }
}

export async function GET() {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const rows = await query<{ pending: number }[]>('SELECT COUNT(*) AS pending FROM content_deletion_log WHERE cleanup_status = ?', ['pending'])
  return NextResponse.json({ pending: Number(rows?.[0]?.pending || 0) }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function POST() {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const rows = await query<PendingCleanupRow[]>(
    'SELECT id, original_object_keys FROM content_deletion_log WHERE cleanup_status = ? ORDER BY created_at ASC LIMIT 50',
    ['pending'],
  )
  let completed = 0
  let pending = 0

  for (const row of rows || []) {
    const archive: DeletionArchiveResult = {
      deletionLogId: Number(row.id),
      originalObjectKeys: parseObjectKeys(row.original_object_keys),
      archivedObjectKeys: [],
    }
    const result = await completeDeletionCleanup(archive, () => deleteObjectsStrict(archive.originalObjectKeys))
    if (result.cleanupPending) pending += 1
    else completed += 1
  }

  return NextResponse.json({ processed: (rows || []).length, completed, pending })
}
