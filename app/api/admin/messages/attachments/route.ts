import { NextResponse } from 'next/server'
import fs from 'fs/promises'
import path from 'path'
import { requireAdmin } from '@/lib/auth'
import { createObjectStorageClient, getObjectStorageBucket, resolveObjectKeyFromReference } from '@/lib/objectStorage'
import { logRouteError } from '@/lib/observability'

function getContentType(filename: string, fallback?: string | null) {
  if (fallback) return fallback
  const ext = path.extname(filename).toLowerCase()
  const mimeMap: Record<string, string> = {
    '.pdf': 'application/pdf',
    '.txt': 'text/plain',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  }
  return mimeMap[ext] || 'application/octet-stream'
}

async function streamToBuffer(stream: NodeJS.ReadableStream) {
  const chunks = []
  for await (const chunk of stream) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  return Buffer.concat(chunks)
}

export async function GET(req: Request) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(req.url)
  const dir = url.searchParams.get('dir')
  const filenameRaw = url.searchParams.get('filename')
  const keyRaw = url.searchParams.get('key')
  const type = url.searchParams.get('type')
  const safeFilename = path.basename(decodeURIComponent(filenameRaw || 'attachment'))

  if (keyRaw) {
    const key = resolveObjectKeyFromReference(decodeURIComponent(keyRaw))
    if (!key) return NextResponse.json({ error: 'Missing key' }, { status: 400 })
    try {
      const bucket = getObjectStorageBucket()
      if (!bucket) return NextResponse.json({ error: 'Bucket not configured' }, { status: 500 })
      const client = createObjectStorageClient()
      const objectStream = await client.getObject(bucket, key)
      const buffer = await streamToBuffer(objectStream)
      return new NextResponse(buffer, { headers: { 'Content-Type': getContentType(safeFilename, type), 'Content-Disposition': `attachment; filename="${safeFilename}"` } })
    } catch (error) {
      logRouteError('api/admin/messages/attachments', error, { action: 'download_attachment', resourceId: key, reason: 'object_storage_read_failed' })
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
  }

  if (!dir || !filenameRaw) return NextResponse.json({ error: 'Missing parameters' }, { status: 400 })

  const filePath = path.join(process.cwd(), 'data', 'uploads', dir, safeFilename)
  try {
    const data = await fs.readFile(filePath)
    return new NextResponse(data, { headers: { 'Content-Type': getContentType(safeFilename, type), 'Content-Disposition': `attachment; filename="${safeFilename}"` } })
  } catch (error) {
    logRouteError('api/admin/messages/attachments', error, { action: 'download_attachment', resourceId: safeFilename, reason: 'legacy_disk_read_failed' })
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
}