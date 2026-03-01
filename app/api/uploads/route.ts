import { NextResponse } from 'next/server'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { getUploadKey, buildPublicUrl } from '@/lib/s3'

type ReqBody = { key?: string; contentType: string; slug?: string; filename?: string }

export async function POST(req: Request) {
  try {
    const body: ReqBody = await req.json()
    if (!body?.contentType) return NextResponse.json({ error: 'contentType required' }, { status: 400 })

    // allow server to generate a key from slug+filename, or accept a provided key
    let key = body.key
    if (!key) {
      if (!body.slug || !body.filename) return NextResponse.json({ error: 'slug and filename required when key not provided' }, { status: 400 })
      key = await getUploadKey(body.slug, body.filename)
    }

    const region = process.env.AWS_REGION
    const bucket = process.env.NEXT_PUBLIC_S3_BUCKET
    if (!region || !bucket) {
      return NextResponse.json({ error: 'S3 not configured' }, { status: 500 })
    }

    const hasCreds = !!(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY)
    // eslint-disable-next-line no-console
    console.log('uploads.presign: hasCreds=', hasCreds, 'bucket=', bucket, 'key=', key, 'contentType=', body.contentType)

    const client = new S3Client({ region, credentials: { accessKeyId: process.env.AWS_ACCESS_KEY_ID!, secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY! } })
    const cmd = new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: body.contentType })
    const url = await getSignedUrl(client, cmd, { expiresIn: 300 })
    const publicUrl = buildPublicUrl(key)

    // parse signed url to surface signing hints in dev
    let debug: any = undefined
    try {
      const u = new URL(url)
      const cred = u.searchParams.get('X-Amz-Credential')
      const signedHeaders = u.searchParams.get('X-Amz-SignedHeaders')
      if (process.env.NODE_ENV !== 'production') {
        const maskedCred = cred ? (cred.slice(0, 6) + '...' + cred.slice(-6)) : null
        debug = { maskedCred, signedHeaders }
        // eslint-disable-next-line no-console
        console.log('uploads.presign debug', debug)
      }
    } catch (e) {
      // ignore
    }

    return NextResponse.json(Object.assign({ url, key, publicUrl }, debug ? { _debug: debug } : {}))
  } catch (err: any) {
    // eslint-disable-next-line no-console
    console.error('upload presign error', err)
    return NextResponse.json({ error: String(err?.message || err) }, { status: 500 })
  }
}
