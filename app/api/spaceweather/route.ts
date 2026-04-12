import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic'
export const revalidate = 0

const NO_STORE_HEADERS = {
  'Cache-Control': 'no-store, max-age=0, must-revalidate',
}

// Server-side proxy for NOAA SWPC data with sensible fallbacks
export async function GET() {
  try {
    const fetchedAt = new Date().toISOString()
    // fetch K-index (3-day) — take latest
    const kRes = await fetch('https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json', { cache: 'no-store' });
    const kJson = kRes.ok ? await kRes.json() : null;
    const latestK = Array.isArray(kJson) && kJson.length
      ? Number((kJson[kJson.length - 1] as Record<string, unknown>).Kp ?? (kJson[kJson.length - 1] as Record<string, unknown>).kp_index ?? 3)
      : null;

    // fetch observed solar indices for F10.7 (may contain recent F107 values)
    const fRes = await fetch('https://services.swpc.noaa.gov/json/f107_cm_flux.json', { cache: 'no-store' });
    const fJson = fRes.ok ? await fRes.json() : null;
    let f107 = null;
    if (Array.isArray(fJson) && fJson.length) {
      const last = fJson[fJson.length - 1] as Record<string, unknown>;
      const flux = Number(last.flux ?? last.f107 ?? last['f107'] ?? last.F107 ?? 92)
      f107 = Number.isFinite(flux) ? flux : null;
    }

    const payload = {
      kIndex: latestK ?? 3,
      f107: f107 ?? 92,
      source: kRes.ok || fRes.ok ? 'noaa' : 'fallback',
      updatedAt: fetchedAt,
    };

    return NextResponse.json(payload, { headers: NO_STORE_HEADERS });
  } catch (err) {
    void err
    // fallback mocked values
    return NextResponse.json({ kIndex: 3, f107: 92, source: 'fallback', updatedAt: new Date().toISOString() }, { headers: NO_STORE_HEADERS });
  }
}
