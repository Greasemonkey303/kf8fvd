import { NextResponse } from 'next/server'

// Ensure this route runs in Node.js runtime so `process.env` is available
export const runtime = 'nodejs'

export async function GET() {
  try {
    const turnstileSiteKey = process.env.NEXT_PUBLIC_CF_TURNSTILE_SITEKEY || null
    return NextResponse.json({ turnstileSiteKey })
  } catch (e) {
    return NextResponse.json({ turnstileSiteKey: null })
  }
}
