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

import { logRouteError } from './observability'

export async function insertAdminAction(details: AdminActionDetails) {
  let query: typeof import('./db').query
  try {
    ;({ query } = await import('./db'))
  } catch (error) {
    logRouteError('lib/adminActions', error, { action: 'insert_admin_action', reason: 'query_loader_failed' })
    throw error
  }

  const metaStr = typeof details?.meta === 'string' ? details.meta : (details?.meta ? JSON.stringify(details.meta) : null)
  const detailsText = details?.details ?? (metaStr && metaStr !== '{}' ? metaStr : null)
  const adminId = typeof details?.admin_user_id !== 'undefined' ? details.admin_user_id : null
  const attempts: Array<{ sql: string; params: unknown[] }> = [
    {
      sql: 'INSERT INTO admin_actions (admin_user_id, actor, actor_type, action, target_key, details, reason, ip, meta) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      params: [adminId, details?.actor || null, details?.actor_type || null, details?.action, details?.target_key || null, detailsText, details?.reason || null, details?.ip || null, metaStr],
    },
    {
      sql: 'INSERT INTO admin_actions (actor, actor_type, action, target_key, reason, ip, meta) VALUES (?, ?, ?, ?, ?, ?, ?)',
      params: [details?.actor || null, details?.actor_type || null, details?.action, details?.target_key || null, details?.reason || null, details?.ip || null, metaStr],
    },
    {
      sql: 'INSERT INTO admin_actions (action, target_key, details) VALUES (?, ?, ?)',
      params: [details?.action, details?.target_key || null, detailsText],
    },
  ]

  let lastError: unknown = new Error('No admin action insert attempts were made')
  for (const attempt of attempts) {
    try {
      await query(attempt.sql, attempt.params)
      return
    } catch (error) {
      lastError = error
    }
  }

  logRouteError('lib/adminActions', lastError, { action: 'insert_admin_action', reason: 'all_insert_attempts_failed' })
  throw lastError
}
