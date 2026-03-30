import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function getUmamiServerUrl() {
  const configured = process.env.UMAMI_SERVER_URL || process.env.NEXT_PUBLIC_UMAMI_HOST_URL || ''
  return configured.trim().replace(/\/+$/, '')
}

export async function POST(request: Request) {
  const umamiServerUrl = getUmamiServerUrl()

  if (!umamiServerUrl) {
    return NextResponse.json({ error: 'Umami server URL is not configured.' }, { status: 503 })
  }

  const body = await request.text()
  if (!body) {
    return NextResponse.json({ error: 'Missing analytics payload.' }, { status: 400 })
  }

  const response = await fetch(`${umamiServerUrl}/api/send`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(request.headers.get('x-umami-cache') ? { 'x-umami-cache': request.headers.get('x-umami-cache') as string } : {}),
      ...(request.headers.get('user-agent') ? { 'user-agent': request.headers.get('user-agent') as string } : {}),
      ...(request.headers.get('accept-language') ? { 'accept-language': request.headers.get('accept-language') as string } : {}),
      ...(request.headers.get('x-forwarded-for') ? { 'x-forwarded-for': request.headers.get('x-forwarded-for') as string } : {}),
      ...(request.headers.get('x-real-ip') ? { 'x-real-ip': request.headers.get('x-real-ip') as string } : {}),
      ...(request.headers.get('referer') ? { referer: request.headers.get('referer') as string } : {}),
    },
    body,
    cache: 'no-store',
  })

  const responseText = await response.text()

  return new NextResponse(responseText, {
    status: response.status,
    headers: {
      'content-type': response.headers.get('content-type') || 'application/json',
      'cache-control': 'no-store',
    },
  })
}