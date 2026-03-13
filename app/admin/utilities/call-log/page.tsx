import React from 'react'
import CalllogUploader from '../../../../components/admin/CalllogUploader'
import { query } from '../../../../lib/db'

export const metadata = {
  title: 'Call Log Upload',
}

export default async function Page() {
  let rows: any[] = []
  let error: string | null = null
  try {
    rows = await query<any[]>(`SELECT id, \`call\`, DATE_FORMAT(qso_date, '%Y-%m-%d') AS qso_date, TIME_FORMAT(time_on, '%H:%i:%s') AS time_on, band, mode, qth, city, state, country, raw_entry, adif_tags, created_at FROM call_logs ORDER BY COALESCE(qso_datetime, created_at) DESC LIMIT 200`)
  } catch (err:any) {
    error = String(err?.message || err)
  }

  return (
    <div>
      <h1>Call Log (ADIF) Upload</h1>
      <p>Upload a .adi file to ingest QSOs into the <strong>call_logs</strong> table. Only admins may perform uploads.</p>

      <CalllogUploader />

      {error ? (
        <div className="card" style={{padding:12}}>
          <strong>Error loading call_logs:</strong>
          <div style={{marginTop:8}}>{error}</div>
          <div style={{marginTop:8}}>
            If this mentions "call_logs" table not found, run the migration SQL file in <em>migrations/</em> to create the table.
          </div>
        </div>
      ) : (
        <div style={{marginTop:12}}>
          <h2>Recent Entries</h2>
          <div style={{overflowX:'auto'}}>
            <table className="table">
              <thead>
                <tr>
                  <th>Call</th>
                  <th>Date</th>
                  <th>Time</th>
                  <th>Band</th>
                  <th>Mode</th>
                  <th>Location</th>
                  <th>Raw</th>
                  <th>Imported</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.id}>
                    <td>{r.call}</td>
                    <td>{r.qso_date || ''}</td>
                    <td>{r.time_on || ''}</td>
                    <td>{r.band || ''}</td>
                    <td>{r.mode || ''}</td>
                    <td>{[r.qth, r.city, r.state, r.country].filter(Boolean).join(', ')}</td>
                    <td>
                      <details>
                        <summary>View ADIF</summary>
                        <pre style={{whiteSpace:'pre-wrap', maxWidth:800}}>{r.raw_entry}</pre>
                        {r.adif_tags && <pre style={{whiteSpace:'pre-wrap'}}>{JSON.stringify(r.adif_tags, null, 2)}</pre>}
                      </details>
                    </td>
                    <td>{new Date(r.created_at).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
