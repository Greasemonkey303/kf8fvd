import { NextResponse } from 'next/server'

async function fetchRange(prefix: string) {
  const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, { method: 'GET', headers: { 'Add-Padding': 'true', 'User-Agent': 'kf8fvd/1.0' } })
  if (!res.ok) throw new Error('HIBP fetch failed')
  const text = await res.text()
  return text
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const prefix = (body?.prefix || '').toString().trim().toUpperCase()
    if (!/^[0-9A-F]{5}$/.test(prefix)) return NextResponse.json({ error: 'Invalid prefix' }, { status: 400 })
    const text = await fetchRange(prefix)
    return NextResponse.json({ ok: true, data: text })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed' }, { status: 400 })
  }
}
