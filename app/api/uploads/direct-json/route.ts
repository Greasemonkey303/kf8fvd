import { NextResponse } from 'next/server'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { requireAdmin } from '@/lib/auth'
import { getUploadKey, buildPublicUrl } from '@/lib/s3'

type Body = { slug?: string; filename?: string; contentType?: string; data?: string }

export async function POST(req: Request) {
  try {
    // allow this endpoint in development without auth for quick testing
    const isDev = process.env.NODE_ENV !== 'production'
    if (!isDev) {
      const admin = await requireAdmin()
      if (!admin) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }

    const body: Body = await req.json()
    if (!body?.data || !body?.filename || !body?.slug) return NextResponse.json({ error: 'slug, filename, data required' }, { status: 400 })

    const buffer = Buffer.from(body.data, 'base64')
    const contentType = body.contentType || 'application/octet-stream'
    const key = await getUploadKey(body.slug, body.filename)

    const region = process.env.AWS_REGION
    const bucket = process.env.NEXT_PUBLIC_S3_BUCKET
    if (!region || !bucket) return NextResponse.json({ error: 'S3 not configured' }, { status: 500 })

    const client = new S3Client({ region, credentials: { accessKeyId: process.env.AWS_ACCESS_KEY_ID!, secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY! } })
    const cmd = new PutObjectCommand({ Bucket: bucket, Key: key, Body: buffer, ContentType: contentType })
    await client.send(cmd)

    const publicUrl = buildPublicUrl(key)
    return NextResponse.json({ key, publicUrl })
  } catch (err: any) {
    // eslint-disable-next-line no-console
    console.error('direct-json upload error', err)
    return NextResponse.json({ error: String(err?.message || err) }, { status: 500 })
  }
}
