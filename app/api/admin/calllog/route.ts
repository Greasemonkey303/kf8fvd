import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { query, transaction } from '@/lib/db'
import type mysql from 'mysql2/promise'
import crypto from 'crypto'

const MAX_UPLOAD_SIZE = parseInt(process.env.MAX_UPLOAD_SIZE || '5242880', 10) // default 5MB

function parseAdifRecords(txt: string): Array<{ raw: string; tags: Record<string, string> }> {
  const raw = txt.replace(/\r/g,'\n')
  const parts = raw.split(/<EOR>|<eor>/).map(s=>s.trim()).filter(Boolean)
  const recs: Array<{ raw: string; tags: Record<string, string> }> = []
  for (const rec of parts) {
    const obj: Record<string, string> = {}
    const re = /<([^:>\s]+)(?::(\d+))?>\s*([^<]*)/g
    let m: RegExpExecArray | null
    while ((m = re.exec(rec)) !== null) {
      const k = m[1].toUpperCase()
      const v = (m[3] || '').trim()
      obj[k] = v
    }
    recs.push({ raw: rec, tags: obj })
  }
  return recs
}

function parseDate(dateStr?: string) {
  if (!dateStr) return null
  const t = dateStr.trim()
  if (/^\d{8}$/.test(t)) return `${t.slice(0,4)}-${t.slice(4,6)}-${t.slice(6,8)}`
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0,10)
  return null
}

function parseTime(timeStr?: string) {
  if (!timeStr) return null
  const t = timeStr.trim()
  if (/^\d{6}$/.test(t)) return `${t.slice(0,2)}:${t.slice(2,4)}:${t.slice(4,6)}`
  if (/^\d{4}$/.test(t)) return `${t.slice(0,2)}:${t.slice(2,4)}:00`
  if (/^\d{2}:\d{2}:\d{2}$/.test(t)) return t
  if (/^\d{2}:\d{2}$/.test(t)) return `${t}:00`
  return null
}

export async function GET(req: Request) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  try {
    const url = new URL(req.url)
    const page = Math.max(1, parseInt(url.searchParams.get('page') || '1'))
    const pageSize = Math.min(1000, Math.max(10, parseInt(url.searchParams.get('pageSize') || '200')))
    const offset = (page - 1) * pageSize
    const rows = await query<Array<Record<string, unknown>>>('SELECT * FROM call_logs ORDER BY COALESCE(qso_datetime, created_at) DESC LIMIT ? OFFSET ?', [pageSize, offset])
    const countRes = await query<Array<Record<string, unknown>>>('SELECT COUNT(*) as cnt FROM call_logs')
    const total = Array.isArray(countRes) && countRes.length ? (countRes[0].cnt || 0) : 0
    return NextResponse.json({ entries: rows || [], total })
  } catch (err) {
    return NextResponse.json({ error: 'failed', details: String(err) }, { status: 500 })
  }
}

export async function POST(req: Request) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  try {
    const form = await req.formData()
    const file = form.get('file') as File | null
    const replace = (form.get('replace') || '').toString() === '1' || (form.get('replace') || '').toString().toLowerCase() === 'true'
    if (!file) return NextResponse.json({ error: 'file-required' }, { status: 400 })
    function getFileProp(f: unknown, prop: string) {
      try { return (f as Record<string, unknown>)[prop] } catch { return undefined }
    }
    const name = (typeof getFileProp(file, 'name') === 'string') ? String(getFileProp(file, 'name')) : ''
    if (!/\.adi$/i.test(name)) return NextResponse.json({ error: 'only .adi files allowed' }, { status: 400 })

    // If the File exposes a size property, enforce server-side max size limit early
    const sizeProp = getFileProp(file, 'size')
    if (typeof sizeProp === 'number' && sizeProp > MAX_UPLOAD_SIZE) {
      return NextResponse.json({ error: 'file-too-large', maxAllowed: MAX_UPLOAD_SIZE }, { status: 400 })
    }

    const txt = await (file as File).text()
    // As a safety check, also enforce size by actual byte length of text
    try {
      const bytes = Buffer.byteLength(txt || '', 'utf8')
      if (bytes > MAX_UPLOAD_SIZE) {
        return NextResponse.json({ error: 'file-too-large', maxAllowed: MAX_UPLOAD_SIZE }, { status: 400 })
      }
    } catch (e) {
      // ignore Buffer errors on unsupported runtimes
    }
    const recs = parseAdifRecords(txt)
    let inserted = 0
    let skipped = 0

    await transaction(async (conn: mysql.PoolConnection) => {
      if (replace) {
        await conn.execute('DELETE FROM call_logs')
      }
      for (const r of recs) {
        const tags = r.tags || {}
        const call = (tags.CALL || '').toUpperCase()
        if (!call) { skipped++; continue }
        const qso_date_raw = tags.QSO_DATE || tags.DATE || ''
        const qso_time_raw = tags.TIME_ON || tags.TIME || ''
        const qso_date = parseDate(qso_date_raw)
        const time_on = parseTime(qso_time_raw)
        let qso_datetime = null
        if (qso_date && time_on) qso_datetime = `${qso_date} ${time_on}`
        const band = tags.BAND || ''
        const frequency = tags.FREQUENCY || ''
        const mode = tags.MODE || ''
        const qth = tags.QTH || tags.CITY || ''
        const city = tags.CITY || ''
        const state = tags.STATE || tags.CNTY || ''
        const country = tags.COUNTRY || ''
        const lat = tags.LAT || tags.LATITUDE || null
        const lon = tags.LON || tags.LONGITUDE || null

        const hash = crypto.createHash('md5').update(`${call}|${qso_date_raw || ''}|${qso_time_raw || ''}|${band || ''}`).digest('hex')

        try {
          const adif_json = JSON.stringify(tags)
          const sql = `INSERT IGNORE INTO call_logs (entry_hash, \`call\`, qso_date, time_on, qso_datetime, band, frequency, mode, qth, city, state, country, lat, lon, raw_entry, adif_tags) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          const params = [
            hash,
            call,
            qso_date,
            time_on,
            qso_datetime,
            band,
            frequency,
            mode,
            qth,
            city,
            state,
            country,
            lat ? Number(lat) : null,
            lon ? Number(lon) : null,
            r.raw || '',
            adif_json
          ]
          const [res] = await conn.execute(sql, params)
          const affected = (res && typeof (res as Record<string, unknown>).affectedRows === 'number') ? Number((res as Record<string, unknown>).affectedRows) : 0
          if (affected > 0) inserted++
          else skipped++
          // no-op: rely on returned counts only
        } catch (e) {
          // skip problematic records
          skipped++
          // ignore record-level errors when inserting
        }
      }
    })

    return NextResponse.json({ inserted, skipped, totalParsed: recs.length })
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('calllog upload error', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
