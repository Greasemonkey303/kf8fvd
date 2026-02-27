import { NextResponse } from 'next/server';

// Server-side proxy for NOAA SWPC data with sensible fallbacks
export async function GET() {
  try {
    // fetch K-index (3-day) — take latest
    const kRes = await fetch('https://services.swpc.noaa.gov/json/planetary_k_index_3_day.json');
    const kJson = kRes.ok ? await kRes.json() : null;
    const latestK = Array.isArray(kJson) && kJson.length ? kJson[kJson.length - 1].k : null;

    // fetch observed solar indices for F10.7 (may contain recent F107 values)
    const fRes = await fetch('https://services.swpc.noaa.gov/json/solar-cycle/observed-solar-indices.json');
    const fJson = fRes.ok ? await fRes.json() : null;
    let f107 = null;
    if (Array.isArray(fJson) && fJson.length) {
      const last = fJson[fJson.length - 1];
      f107 = last && (last.f107 || last['f107'] || last.F107) ? (last.f107 || last['f107'] || last.F107) : null;
    }

    const payload = {
      kIndex: latestK ?? 3,
      f107: f107 ?? 92,
      source: 'noaa'
    };

    return NextResponse.json(payload);
  } catch (err) {
    // fallback mocked values
    return NextResponse.json({ kIndex: 3, f107: 92, source: 'fallback' });
  }
}
