export type AdminActionDetails = {
  admin_user_id?: number | null
  actor?: string | null
  actor_type?: string | null
  action?: string | null
  target_key?: string | null
  details?: string | null
  meta?: unknown
  reason?: string | null
  ip?: string | null
}

export async function insertAdminAction(details: AdminActionDetails) {
  try {
    const { query } = await import('./db')
    const metaStr = typeof details?.meta === 'string' ? details.meta : (details?.meta ? JSON.stringify(details.meta) : null)
    const detailsText = details?.details ?? (metaStr && metaStr !== '{}' ? metaStr : null)
    const adminId = typeof details?.admin_user_id !== 'undefined' ? details.admin_user_id : null

    try {
      await query(
        'INSERT INTO admin_actions (admin_user_id, actor, actor_type, action, target_key, details, reason, ip, meta) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [adminId, details?.actor || null, details?.actor_type || null, details?.action, details?.target_key || null, detailsText, details?.reason || null, details?.ip || null, metaStr]
      )
      return
    } catch (e) {
      void e
      // fallback to older schema
      try {
        await query('INSERT INTO admin_actions (actor, actor_type, action, target_key, reason, ip, meta) VALUES (?, ?, ?, ?, ?, ?, ?)', [details?.actor || null, details?.actor_type || null, details?.action, details?.target_key || null, details?.reason || null, details?.ip || null, metaStr])
        return
      } catch (e2) {
        void e2
        try {
          await query('INSERT INTO admin_actions (action, target_key, details) VALUES (?, ?, ?)', [details?.action, details?.target_key || null, detailsText])
          return
        } catch (e3) {
          void e3
          try { console.warn('[admin] failed to write admin_actions', e3) } catch (_err) { void _err }
        }
      }
    }
  } catch (e) {
    void e
    try { console.warn('[admin] failed to write admin_actions', e) } catch (_err) { void _err }
  }
}
