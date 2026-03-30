'use server'

import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/auth'
import { query } from '@/lib/db'

type OnAirRecord = Record<string, unknown>

export async function setOnAirStateAction(nextState: boolean) {
  const admin = await requireAdmin()
  if (!admin) return { ok: false, error: 'Unauthorized', item: null as OnAirRecord | null }

  try {
    const is_on = nextState ? 1 : 0
    const updated_by = admin.email.slice(0, 128)

    const rows = await query<Record<string, unknown>[]>('SELECT id FROM onair ORDER BY id ASC LIMIT 1')
    if (Array.isArray(rows) && rows.length) {
      await query('UPDATE onair SET is_on = ?, updated_by = ?, note = ? WHERE id = ?', [is_on, updated_by, null, rows[0].id])
    } else {
      await query('INSERT INTO onair (is_on, updated_by, note) VALUES (?, ?, ?)', [is_on, updated_by, null])
    }

    const updated = await query<Record<string, unknown>[]>('SELECT * FROM onair ORDER BY id ASC LIMIT 1')
    revalidatePath('/')
    revalidatePath('/admin')
    revalidatePath('/admin/utilities/monitoring')

    return {
      ok: true,
      error: null,
      item: Array.isArray(updated) && updated.length ? updated[0] : ({ is_on } as OnAirRecord),
    }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Failed to update On Air state',
      item: null as OnAirRecord | null,
    }
  }
}