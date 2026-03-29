import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { buildPublicUrl } from '@/lib/s3'
import { generateWebpVariantForObject } from '@/lib/webpVariants'
import { parseJsonObject, readString, validationErrorResponse } from '@/lib/validation'

export async function POST(req: Request) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = await parseJsonObject(req)
    const key = readString(body, 'key', { required: true, maxLength: 2048 })
    const variant = await generateWebpVariantForObject(key)
    return NextResponse.json({ ok: true, key, publicUrl: buildPublicUrl(key), variants: variant && variant.webpKey ? { webp: variant.webpKey } : null })
  } catch (error) {
    const response = validationErrorResponse(error)
    if (response) return response
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 })
  }
}