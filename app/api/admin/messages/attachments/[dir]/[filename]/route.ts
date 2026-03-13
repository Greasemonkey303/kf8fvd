import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import fs from 'fs/promises'
import path from 'path'

export async function GET(req: Request, { params }: { params: { dir: string; filename: string } | Promise<{ dir: string; filename: string }> }) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const resolvedParams = await params
  const dir = resolvedParams?.dir
  const filenameRaw = resolvedParams?.filename
  if (!dir || !filenameRaw) return NextResponse.json({ error: 'Missing parameters' }, { status: 400 })

  const safeFilename = path.basename(decodeURIComponent(filenameRaw))
  const filePath = path.join(process.cwd(), 'data', 'uploads', dir, safeFilename)

  try {
    const data = await fs.readFile(filePath)
    const ext = path.extname(safeFilename).toLowerCase()
    const mimeMap: Record<string, string> = {
      '.pdf': 'application/pdf',
      '.txt': 'text/plain',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.doc': 'application/msword',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    }
    const contentType = mimeMap[ext] || 'application/octet-stream'
    return new NextResponse(data, { headers: { 'Content-Type': contentType, 'Content-Disposition': `attachment; filename="${safeFilename}"` } })
  } catch (e) {
    console.error('[api/admin/messages/attachments] file error', e)
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
}
