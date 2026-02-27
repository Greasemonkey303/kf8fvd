import fs from 'fs/promises';
import path from 'path';
import { NextResponse } from 'next/server';

const CACHE_PATH = path.join(process.cwd(), 'data', 'geocode-cache.json');

async function ensureCache(): Promise<Record<string, { lat:number; lon:number }>> {
  try {
    const txt = await fs.readFile(CACHE_PATH, 'utf8');
    return JSON.parse(txt);
  } catch (e) {
    await fs.mkdir(path.dirname(CACHE_PATH), { recursive: true });
    await fs.writeFile(CACHE_PATH, JSON.stringify({}), 'utf8');
    return {};
  }
}

async function saveCache(cache: Record<string, { lat:number; lon:number }>) {
  await fs.writeFile(CACHE_PATH, JSON.stringify(cache, null, 2), 'utf8');
}

async function geocodeOne(q: string): Promise<{ lat:number; lon:number } | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`;
    const res = await fetch(url, { headers: { 'User-Agent': 'kf8fvd-server/1.0' } });
    if (!res.ok) return null;
    const js = await res.json();
    if (!Array.isArray(js) || js.length === 0) return null;
    return { lat: parseFloat(js[0].lat), lon: parseFloat(js[0].lon) };
  } catch (e) {
    return null;
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const locations: string[] = Array.isArray(body.locations) ? body.locations : [];
    const cache = await ensureCache();
    const result: Record<string, { lat:number; lon:number } | null> = {};

    for (let i = 0; i < locations.length; i++) {
      const key = locations[i].trim();
      if (!key) continue;
      if (cache[key]) {
        result[key] = cache[key];
        continue;
      }
      // rate-limit: small delay between external calls
      if (i > 0) await new Promise(r => setTimeout(r, 900));
      const g = await geocodeOne(key);
      if (g) {
        cache[key] = g;
        result[key] = g;
      } else {
        result[key] = null;
      }
    }

    await saveCache(cache);
    return NextResponse.json({ ok: true, results: result });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
