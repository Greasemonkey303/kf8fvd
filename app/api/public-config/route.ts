import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const turnstileSiteKey = process.env.NEXT_PUBLIC_CF_TURNSTILE_SITEKEY || null
    return NextResponse.json({ turnstileSiteKey })
  } catch (e) {
    return NextResponse.json({ turnstileSiteKey: null })
  }
}
