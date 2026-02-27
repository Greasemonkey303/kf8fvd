import { NextResponse } from 'next/server';

// Server-side helper to return recent QSOs.
// Configure via environment variables:
// - LOGBOOK_PROVIDER = 'qrz' or 'custom'
// - QRZ_API_KEY = your QRZ API key (if using QRZ; note: QRZ XML API may require session handling)
// - LOGBOOK_URL = custom JSON endpoint returning an array of QSO strings

import fs from 'fs';
import path from 'path';

export async function GET(request: Request) {
  try {
    const provider = process.env.LOGBOOK_PROVIDER || (process.env.QRZ_API_KEY ? 'qrz' : 'mock');

    // quick debug via ?diag=1
    try {
      const url = new URL(request.url);
      if (url.searchParams.get('diag')) {
        return NextResponse.json({
          source: 'diag',
          provider,
          env: {
            LOGBOOK_PROVIDER: process.env.LOGBOOK_PROVIDER || null,
            QRZ_API_KEY_present: !!process.env.QRZ_API_KEY,
            QRZ_USERNAME_present: !!process.env.QRZ_USERNAME,
            QRZ_PASSWORD_present: !!process.env.QRZ_PASSWORD,
            NODE_ENV: process.env.NODE_ENV || null,
          },
        });
      }
    } catch (e) {
      // ignore
    }

    // If a local ADIF file exists in public/, prefer that as a quick local import
    try {
      const localAdiPath = path.join(process.cwd(), 'public', 'logbook.adi');
      if (fs.existsSync(localAdiPath)) {
        const rawAdi = fs.readFileSync(localAdiPath, { encoding: 'utf8' });
        const records = rawAdi.split(/<eor>/i).map(r => r.trim()).filter(Boolean);
        const entries = records.slice(0, 50).map((rec) => {
          const callMatch = rec.match(/<call(?::\d+)?>\s*([^<\s]+)/i);
          const dateMatch = rec.match(/<qso_date(?::\d+)?>\s*([^<\s]+)/i) || rec.match(/<date(?::\d+)?>\s*([^<\s]+)/i);
          const timeMatch = rec.match(/<time_on(?::\d+)?>\s*([^<\s]+)/i) || rec.match(/<time(?::\d+)?>\s*([^<\s]+)/i);
          const bandMatch = rec.match(/<band(?::\d+)?>\s*([^<\s]+)/i) || rec.match(/<frequency(?::\d+)?>\s*([^<\s]+)/i);
          const modeMatch = rec.match(/<mode(?::\d+)?>\s*([^<\s]+)/i);
          const call = callMatch ? callMatch[1] : 'N/A';
          const date = dateMatch ? dateMatch[1] : '';
          const time = timeMatch ? timeMatch[1] : '';
          const band = bandMatch ? bandMatch[1] : '';
          const mode = modeMatch ? modeMatch[1] : '';
          const parts: string[] = [];
          if (date) parts.push(date + (time ? ' ' + time : ''));
          parts.push(call);
          if (band) parts.push(band);
          if (mode) parts.push(mode);
          return parts.filter(Boolean).join(' — ');
        });
        return NextResponse.json({ source: 'local-adi', entries });
      }
    } catch (e) {
      // ignore local ADIF read errors and continue
    }

    if (provider === 'custom' && process.env.LOGBOOK_URL) {
      const res = await fetch(process.env.LOGBOOK_URL, { headers: { 'Authorization': `Bearer ${process.env.LOGBOOK_API_KEY || ''}` } });
      if (res.ok) {
        const data = await res.json();
        return NextResponse.json({ source: 'custom', entries: data });
      }
    }

    if (provider === 'qrz') {
      const fetchXml = async (url: string) => {
        const r = await fetch(url);
        const text = await r.text();
        return { ok: r.ok, status: r.status, text };
      };

      // 1) Try QRZ API key
      if (process.env.QRZ_API_KEY) {
        const url = `https://xmldata.qrz.com/xml/current/?s=${process.env.QRZ_API_KEY}`;
        const raw = await fetchXml(url);
        if (raw) {
          if (raw.ok) {
            const xmlErrorMatch = raw.text.match(/<Error>([\s\S]*?)<\/Error>/i);
            const hasXmlError = !!xmlErrorMatch;
            if (!hasXmlError) {
              const qsoMatches = Array.from(raw.text.matchAll(/<qso>([\s\S]*?)<\/qso>/gi));
              if (qsoMatches.length) {
                const entries = qsoMatches.slice(0, 12).map((m) => {
                  const block = m[1];
                  const callMatch = block.match(/<call>([^<]+)<\/call>/i);
                  const dateMatch = block.match(/<qso_date>([^<]+)<\/qso_date>/i) || block.match(/<time_on>([^<]+)<\/time_on>/i) || block.match(/<date>([^<]+)<\/date>/i);
                  const bandMatch = block.match(/<band>([^<]+)<\/band>/i) || block.match(/<frequency>([^<]+)<\/frequency>/i);
                  const modeMatch = block.match(/<mode>([^<]+)<\/mode>/i);
                  const timeMatch = block.match(/<time_on>([^<]+)<\/time_on>/i) || block.match(/<time>([^<]+)<\/time>/i);
                  const call = callMatch ? callMatch[1] : 'N/A';
                  const date = dateMatch ? dateMatch[1] : (timeMatch ? timeMatch[1] : '');
                  const band = bandMatch ? bandMatch[1] : '';
                  const mode = modeMatch ? modeMatch[1] : '';
                  const parts: string[] = [];
                  if (date) parts.push(date);
                  parts.push(call);
                  if (band) parts.push(band);
                  if (mode) parts.push(mode);
                  return parts.filter(Boolean).join(' — ');
                });
                return NextResponse.json({ source: 'qrz', entries });
              }
              return NextResponse.json({ source: 'qrz', debug: { stage: 'apikey-no-qso', status: raw.status, body: raw.text.slice(0, 400) } });
            }
            if (hasXmlError && (!process.env.QRZ_USERNAME || !process.env.QRZ_PASSWORD)) {
              return NextResponse.json({ source: 'qrz', debug: { stage: 'apikey-xml-error', status: raw.status, error: xmlErrorMatch ? xmlErrorMatch[1] : 'unknown', body: raw.text.slice(0, 400) } });
            }
          } else {
            return NextResponse.json({ source: 'qrz', debug: { stage: 'apikey-error', status: raw.status, body: raw.text.slice(0, 400) } });
          }
        }
      }

      // 2) Try username/password login
      if (process.env.QRZ_USERNAME && process.env.QRZ_PASSWORD) {
        const loginUrl = `https://xmldata.qrz.com/xml/current/?username=${encodeURIComponent(process.env.QRZ_USERNAME)};password=${encodeURIComponent(process.env.QRZ_PASSWORD)}`;
        const raw2 = await fetchXml(loginUrl);
        if (raw2) {
          if (raw2.ok) {
            const qsoMatches = Array.from(raw2.text.matchAll(/<qso>([\s\S]*?)<\/qso>/gi));
            if (qsoMatches.length) {
              const entries = qsoMatches.slice(0, 12).map((m) => {
                const block = m[1];
                const callMatch = block.match(/<call>([^<]+)<\/call>/i);
                const dateMatch = block.match(/<qso_date>([^<]+)<\/qso_date>/i) || block.match(/<time_on>([^<]+)<\/time_on>/i) || block.match(/<date>([^<]+)<\/date>/i);
                const bandMatch = block.match(/<band>([^<]+)<\/band>/i) || block.match(/<frequency>([^<]+)<\/frequency>/i);
                const modeMatch = block.match(/<mode>([^<]+)<\/mode>/i);
                const timeMatch = block.match(/<time_on>([^<]+)<\/time_on>/i) || block.match(/<time>([^<]+)<\/time>/i);
                const call = callMatch ? callMatch[1] : 'N/A';
                const date = dateMatch ? dateMatch[1] : (timeMatch ? timeMatch[1] : '');
                const band = bandMatch ? bandMatch[1] : '';
                const mode = modeMatch ? modeMatch[1] : '';
                const parts: string[] = [];
                if (date) parts.push(date);
                parts.push(call);
                if (band) parts.push(band);
                if (mode) parts.push(mode);
                return parts.filter(Boolean).join(' — ');
              });
              return NextResponse.json({ source: 'qrz', entries });
            }

            // no qso entries in login response; try using the session key to fetch common logbook endpoints
            const keyMatch = raw2.text.match(/<Key>([0-9a-fA-F]+)<\/Key>/i);
            const sessionKey = keyMatch ? keyMatch[1] : null;
            if (sessionKey) {
              const usernameParam = encodeURIComponent(process.env.QRZ_USERNAME || '');
              const candidates = [
                // common variants
                `https://xmldata.qrz.com/xml/Logbook/?s=${sessionKey}`,
                `https://xmldata.qrz.com/xml/Logbook?s=${sessionKey}`,
                `https://xmldata.qrz.com/xml/logbook/?s=${sessionKey}`,
                `https://xmldata.qrz.com/xml/logbook?s=${sessionKey}`,
                `https://xmldata.qrz.com/xml/mylog/?s=${sessionKey}`,
                // include username-first variants
                `https://xmldata.qrz.com/xml/current/?s=${sessionKey}&username=${usernameParam}`,
                `https://xmldata.qrz.com/xml/current/?username=${usernameParam}&s=${sessionKey}`,
                `https://xmldata.qrz.com/xml/Logbook/?u=${usernameParam}&s=${sessionKey}`,
                `https://xmldata.qrz.com/xml/logbook/?u=${usernameParam}&s=${sessionKey}`,
                // legacy / alternate endpoints
                `https://xmldata.qrz.com/xml/logs/?s=${sessionKey}`,
                `https://xmldata.qrz.com/xml/logbookview/?s=${sessionKey}`,
              ];
              for (const cu of candidates) {
                try {
                  const r = await fetch(cu);
                  if (!r.ok) continue;
                  const t = await r.text();
                  const matches = Array.from(t.matchAll(/<qso>([\s\S]*?)<\/qso>/gi));
                  if (matches.length) {
                    const entries = matches.slice(0, 12).map((m) => {
                      const block = m[1];
                      const callMatch = block.match(/<call>([^<]+)<\/call>/i);
                      const dateMatch = block.match(/<qso_date>([^<]+)<\/qso_date>/i) || block.match(/<time_on>([^<]+)<\/time_on>/i) || block.match(/<date>([^<]+)<\/date>/i);
                      const bandMatch = block.match(/<band>([^<]+)<\/band>/i) || block.match(/<frequency>([^<]+)<\/frequency>/i);
                      const modeMatch = block.match(/<mode>([^<]+)<\/mode>/i);
                      const timeMatch = block.match(/<time_on>([^<]+)<\/time_on>/i) || block.match(/<time>([^<]+)<\/time>/i);
                      const call = callMatch ? callMatch[1] : 'N/A';
                      const date = dateMatch ? dateMatch[1] : (timeMatch ? timeMatch[1] : '');
                      const band = bandMatch ? bandMatch[1] : '';
                      const mode = modeMatch ? modeMatch[1] : '';
                      const parts: string[] = [];
                      if (date) parts.push(date);
                      parts.push(call);
                      if (band) parts.push(band);
                      if (mode) parts.push(mode);
                      return parts.filter(Boolean).join(' — ');
                    });
                    return NextResponse.json({ source: 'qrz', entries, fetchedFrom: cu });
                  }
                } catch (e) {
                  // ignore and try next
                }
              }
            }

            return NextResponse.json({ source: 'qrz', debug: { stage: 'login-no-qso', status: raw2.status, body: raw2.text.slice(0, 400) } });
          }

          return NextResponse.json({ source: 'qrz', debug: { stage: 'login-error', status: raw2.status, body: raw2.text.slice(0, 400) } });
        }
      }

      // 3) Final fallback: try plain fetch with API key (raw text)
      if (process.env.QRZ_API_KEY) {
        const url = `https://xmldata.qrz.com/xml/current/?s=${process.env.QRZ_API_KEY}`;
        const res2 = await fetch(url);
        if (res2.ok) {
          const text = await res2.text();
          return NextResponse.json({ source: 'qrz', raw: text.slice(0, 400) });
        }
      }
    }

    // fallback mock
    const mock = [
      '2026-02-25 — W8IRA — 146.52 FM — 59',
      '2026-02-24 — N8ABC — D-STAR REF030C — 10:12Z',
      '2026-02-20 — KD8RXD — DMR TG1 — 14:32Z',
    ];

    return NextResponse.json({ source: 'mock', entries: mock });
  } catch (err) {
    return NextResponse.json({ source: 'error', entries: [] });
  }
}
