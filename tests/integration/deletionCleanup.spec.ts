import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.restoreAllMocks()
  vi.resetModules()
})

async function setup() {
  const query = vi.fn().mockResolvedValue({ affectedRows: 1 })
  vi.doMock('@/lib/db', () => ({ query }))
  const deletionArchive = await import('@/lib/deletionArchive')
  const archive: import('@/lib/deletionArchive').DeletionArchiveResult = {
    deletionLogId: 7,
    originalObjectKeys: ['projects/demo/image.jpg'],
    archivedObjectKeys: ['trash/project/demo/projects/demo/image.jpg'],
  }
  return { ...deletionArchive, archive, query }
}

describe('deletion cleanup orchestration', () => {
  it('marks cleanup complete after the database mutation succeeds', async () => {
    const { archive, commitDeletionWithCleanup, query } = await setup()
    const databaseMutation = vi.fn().mockResolvedValue({ affectedRows: 1 })
    const cleanup = vi.fn().mockResolvedValue([])

    await expect(commitDeletionWithCleanup(archive, databaseMutation, cleanup)).resolves.toEqual({ cleanupPending: false })
    expect(databaseMutation).toHaveBeenCalledBefore(cleanup)
    expect(query).toHaveBeenCalledWith(expect.stringContaining('cleanup_status = ?'), ['complete', 7])
  })

  it('leaves a retryable pending record when object cleanup fails', async () => {
    const { archive, commitDeletionWithCleanup, query } = await setup()
    const databaseMutation = vi.fn().mockResolvedValue({ affectedRows: 1 })
    const cleanup = vi.fn().mockRejectedValue(new Error('storage unavailable'))

    await expect(commitDeletionWithCleanup(archive, databaseMutation, cleanup)).resolves.toEqual({ cleanupPending: true })
    expect(query).toHaveBeenCalledWith(expect.stringContaining('cleanup_status = ?'), ['pending', 'storage unavailable', 7])
  })

  it('cancels cleanup and never deletes objects when the database mutation fails', async () => {
    const { archive, commitDeletionWithCleanup, query } = await setup()
    const databaseMutation = vi.fn().mockRejectedValue(new Error('database unavailable'))
    const cleanup = vi.fn()

    await expect(commitDeletionWithCleanup(archive, databaseMutation, cleanup)).rejects.toThrow('database unavailable')
    expect(cleanup).not.toHaveBeenCalled()
    expect(query).toHaveBeenCalledWith(expect.stringContaining('cleanup_status = ?'), ['cancelled', 'database unavailable', 7])
  })
})
