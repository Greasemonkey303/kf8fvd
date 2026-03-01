import { NextResponse } from 'next/server'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { requireAdmin } from '@/lib/auth'
import { getUploadKey, buildPublicUrl } from '@/lib/s3'

export async function POST(req: Request) {
  try {
    const admin = await requireAdmin()
    if (!admin) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

    const form = await req.formData()
    const file = form.get('file') as any
    const slug = form.get('slug')?.toString() || form.get('folder')?.toString()
    const filename = form.get('filename')?.toString() || (file && file.name)
    const contentType = (file && file.type) || 'application/octet-stream'

    if (!file || !filename || !slug) return NextResponse.json({ error: 'file, slug and filename required' }, { status: 400 })

    const key = await getUploadKey(slug, filename)
    const region = process.env.AWS_REGION
    const bucket = process.env.NEXT_PUBLIC_S3_BUCKET
    if (!region || !bucket) return NextResponse.json({ error: 'S3 not configured' }, { status: 500 })

    const client = new S3Client({ region, credentials: { accessKeyId: process.env.AWS_ACCESS_KEY_ID!, secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY! } })
    const buffer = Buffer.from(await file.arrayBuffer())
    const cmd = new PutObjectCommand({ Bucket: bucket, Key: key, Body: buffer, ContentType: contentType })
    await client.send(cmd)

    const publicUrl = buildPublicUrl(key)
    return NextResponse.json({ key, publicUrl })
  } catch (err: any) {
    // eslint-disable-next-line no-console
    console.error('direct upload error', err)
    return NextResponse.json({ error: String(err?.message || err) }, { status: 500 })
  }
}
