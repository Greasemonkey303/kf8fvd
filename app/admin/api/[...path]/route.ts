import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export const dynamic = 'force-dynamic'

const HOP_BY_HOP_HEADERS = new Set([
  'connection',
  'content-length',
  'host',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
])

async function proxyAdminRequest(req: NextRequest, params: { path: string[] } | Promise<{ path: string[] }>) {
  const resolvedParams = await params
  const pathSegments = Array.isArray(resolvedParams?.path) ? resolvedParams.path : []
  const internalAppOrigin = process.env.INTERNAL_APP_ORIGIN || `http://127.0.0.1:${process.env.PORT || '3000'}`
  const targetUrl = new URL(`/api/admin/${pathSegments.join('/')}`, internalAppOrigin)
  targetUrl.search = req.nextUrl.search

  const headers = new Headers()
  req.headers.forEach((value, key) => {
    if (!HOP_BY_HOP_HEADERS.has(key.toLowerCase())) {
      headers.set(key, value)
    }
  })

  const upstream = await fetch(targetUrl.toString(), {
    method: req.method,
    headers,
    body: req.method === 'GET' || req.method === 'HEAD' ? undefined : await req.text(),
    cache: 'no-store',
    redirect: 'manual',
  })

  const responseHeaders = new Headers()
  for (const headerName of ['content-type', 'content-disposition', 'etag', 'last-modified']) {
    const value = upstream.headers.get(headerName)
    if (value) responseHeaders.set(headerName, value)
  }
  responseHeaders.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')

  return new NextResponse(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  })
}

export async function GET(req: NextRequest, context: { params: { path: string[] } | Promise<{ path: string[] }> }) {
  return proxyAdminRequest(req, context.params)
}

export async function POST(req: NextRequest, context: { params: { path: string[] } | Promise<{ path: string[] }> }) {
  return proxyAdminRequest(req, context.params)
}

export async function PUT(req: NextRequest, context: { params: { path: string[] } | Promise<{ path: string[] }> }) {
  return proxyAdminRequest(req, context.params)
}

export async function PATCH(req: NextRequest, context: { params: { path: string[] } | Promise<{ path: string[] }> }) {
  return proxyAdminRequest(req, context.params)
}

export async function DELETE(req: NextRequest, context: { params: { path: string[] } | Promise<{ path: string[] }> }) {
  return proxyAdminRequest(req, context.params)
}
