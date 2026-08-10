import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.restoreAllMocks()
  vi.resetModules()
})

describe('admin action audit durability', () => {
  it('uses a compatible fallback schema when the current insert is unavailable', async () => {
    const db = await import('../../lib/db')
    const query = vi.spyOn(db, 'query')
      .mockRejectedValueOnce(new Error('unknown column'))
      .mockResolvedValueOnce({ insertId: 1 })
    const { insertAdminAction } = await import('../../lib/adminActions')

    await expect(insertAdminAction({ actor: 'admin@example.com', action: 'unlock', target_key: 'ip:203.0.113.1' })).resolves.toBeUndefined()
    expect(query).toHaveBeenCalledTimes(2)
  })

  it('throws after every audit insert attempt fails', async () => {
    const db = await import('../../lib/db')
    const observability = await import('../../lib/observability')
    vi.spyOn(db, 'query').mockRejectedValue(new Error('database unavailable'))
    const logError = vi.spyOn(observability, 'logRouteError').mockImplementation(() => undefined)
    const { insertAdminAction } = await import('../../lib/adminActions')

    await expect(insertAdminAction({ actor: 'admin@example.com', action: 'export' })).rejects.toThrow('database unavailable')
    expect(logError).toHaveBeenCalledWith('lib/adminActions', expect.any(Error), expect.objectContaining({ reason: 'all_insert_attempts_failed' }))
  })
})
