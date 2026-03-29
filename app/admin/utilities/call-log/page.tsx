import styles from '../../admin.module.css'
import React from 'react'
import CalllogUploader from '../../../../components/admin/CalllogUploader'
import { query } from '../../../../lib/db'

export const metadata = {
  title: 'Call Log Upload',
}

export default async function Page() {
  let rows: Record<string, unknown>[] = []
  let error: string | null = null
  try {
    rows = await query<Record<string, unknown>[]>(`SELECT id, \`call\`, DATE_FORMAT(qso_date, '%Y-%m-%d') AS qso_date, TIME_FORMAT(time_on, '%H:%i:%s') AS time_on, band, mode, qth, city, state, country, raw_entry, adif_tags, created_at FROM call_logs ORDER BY COALESCE(qso_datetime, created_at) DESC LIMIT 200`)
  } catch (err: unknown) {
    error = err instanceof Error ? err.message : String(err)
  }

  return (
    <div>
      <h1>Call Log (ADIF) Upload</h1>
      <p>Upload a .adi file to ingest QSOs into the <strong>call_logs</strong> table. Only admins may perform uploads.</p>

      <CalllogUploader />

      {error ? (
        <div className={`card ${styles.callLogCard}`}>
          <strong>Error loading call_logs:</strong>
          <div className={styles.mt6}>{error}</div>
          <div className={styles.mt6}>
            If this mentions &quot;call_logs&quot; table not found, run the migration SQL file in <em>migrations/</em> to create the table.
          </div>
        </div>
      ) : (
        <div className={styles.callLogBody}>
          <h2>Recent Entries</h2>
          <div className={styles.scrollX}>
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
                  <tr key={String(r.id)}>
                    <td>{String(r.call || '')}</td>
                    <td>{String(r.qso_date || '')}</td>
                    <td>{String(r.time_on || '')}</td>
                    <td>{String(r.band || '')}</td>
                    <td>{String(r.mode || '')}</td>
                    <td>{[r.qth, r.city, r.state, r.country].filter(Boolean).map(String).join(', ')}</td>
                    <td>
                      <details>
                        <summary>View ADIF</summary>
                        <pre className={styles.preWrapMax}>{String(r.raw_entry || '')}</pre>
                        {Boolean(r.adif_tags) && <pre className={styles.preWrap}>{JSON.stringify(r.adif_tags, null, 2)}</pre>}
                      </details>
                    </td>
                    <td>{new Date(String(r.created_at || '')).toLocaleString()}</td>
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
