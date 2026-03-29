import { query } from './db'
import { createObjectStorageClient, getObjectStorageBucket, resolveObjectKeyFromReference } from './objectStorage'

function sanitizeSegment(value: string) {
  return String(value || 'item').replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'item'
}

async function streamToBuffer(stream: NodeJS.ReadableStream) {
  const chunks: Buffer[] = []
  for await (const chunk of stream) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  return Buffer.concat(chunks)
}

type ArchiveInput = {
  contentType: string
  originalId?: number | string | null
  slug?: string | null
  snapshot: unknown
  objectReferences?: Array<unknown>
  deletedBy?: string | null
}

export async function archiveDeletedContent(input: ArchiveInput) {
  const originalObjectKeys = Array.from(
    new Set((input.objectReferences || []).map((value) => resolveObjectKeyFromReference(value)).filter((value): value is string => Boolean(value)))
  )

  const archivedObjectKeys: string[] = []
  const bucket = getObjectStorageBucket()
  if (bucket && originalObjectKeys.length) {
    const client = createObjectStorageClient()
    const archivePrefix = `trash/${sanitizeSegment(input.contentType)}/${Date.now()}-${sanitizeSegment(input.slug || String(input.originalId || 'item'))}`
    for (const key of originalObjectKeys) {
      const objectStream = await client.getObject(bucket, key)
      const body = await streamToBuffer(objectStream)
      const trashKey = `${archivePrefix}/${key}`
      await client.putObject(bucket, trashKey, body, body.length)
      archivedObjectKeys.push(trashKey)
    }
  }

  await query(
    'INSERT INTO content_deletion_log (content_type, original_id, slug, snapshot_json, original_object_keys, archived_object_keys, deleted_by) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [
      input.contentType,
      input.originalId ?? null,
      input.slug ?? null,
      JSON.stringify(input.snapshot ?? null),
      JSON.stringify(originalObjectKeys),
      JSON.stringify(archivedObjectKeys),
      input.deletedBy ?? null,
    ]
  )

  return { originalObjectKeys, archivedObjectKeys }
}