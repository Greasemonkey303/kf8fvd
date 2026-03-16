import { NextResponse } from 'next/server'
import { getRedisUrl } from '@/lib/rateLimiterConfig'

export async function GET() {
  const required = [
    'NEXTAUTH_SECRET',
    'NEXT_PUBLIC_S3_BUCKET',
    'DB_HOST',
    'DB_USER',
    'DB_NAME',
  ]

  const missing: string[] = []
  for (const k of required) {
    if (!process.env[k]) missing.push(k)
  }

  // Admin credentials: require at least one admin auth method configured
  const adminConfigured = !!process.env.ADMIN_API_KEY || (!!process.env.ADMIN_BASIC_USER && !!process.env.ADMIN_BASIC_PASSWORD)
  if (!adminConfigured) missing.push('ADMIN_API_KEY or ADMIN_BASIC_USER+ADMIN_BASIC_PASSWORD')

  // Redis: require REDIS_URL in production
  try {
    getRedisUrl()
  } catch (e) {
    void e
    missing.push('REDIS_URL')
  }

  if (missing.length) return NextResponse.json({ ok: false, missing }, { status: 500 })

  return NextResponse.json({ ok: true })
}

export async function HEAD() {
  return new NextResponse(null, { status: 200 })
}
