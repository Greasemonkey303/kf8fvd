"use client"

import React, { useEffect, useState } from 'react'
import styles from '../../admin.module.css'

type MonitoringPayload = {
  generatedAt: string
  health: {
    ok: boolean
    missing: string[]
    dependencies: Record<string, { ok: boolean; latencyMs?: number; error?: string }>
  }
  abuse: {
    overallStatus: 'ok' | 'warning' | 'critical'
    summary: Record<string, number>
    statuses: Record<string, 'ok' | 'warning' | 'critical'>
  }
  storagePolicy: {
    target: string
    exception: string
  }
}

function toneClass(status: string) {
  if (status === 'ok') return styles.monitorStatusOk
  if (status === 'warning') return styles.monitorStatusWarning
  if (status === 'critical') return styles.monitorStatusCritical
  return styles.monitorStatusUnknown
}

export default function MonitoringPage() {
  const [data, setData] = useState<MonitoringPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  const load = async () => {
    setRefreshing(true)
    try {
      const res = await fetch('/admin/monitoring', { cache: 'no-store' })
      const json = await res.json().catch(() => null)
      if (!res.ok) throw new Error((json && typeof json.error === 'string') ? json.error : 'Failed to load monitoring')
      setData(json as MonitoringPayload)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setRefreshing(false)
    }
  }

  useEffect(() => {
    void load()
    const timer = window.setInterval(() => { void load() }, 30000)
    return () => window.clearInterval(timer)
  }, [])

  return (
    <main className={styles.utilityPage}>
      <div className={styles.pageHeader}>
        <div className={styles.pageTitleGroup}>
          <h1 className={styles.pageTitle}>Monitoring</h1>
          <div className={styles.pageSubtitle}>Live dependency health, abuse monitoring, and storage policy status for the admin console.</div>
        </div>
        <div className={styles.pageActions}>
          {data?.generatedAt ? <span className={styles.smallMuted}>Updated {new Date(data.generatedAt).toLocaleTimeString()}</span> : null}
          <button className={styles.btnGhost} onClick={() => { void load() }} disabled={refreshing}>Refresh</button>
        </div>
      </div>

      {error ? (
        <div className={`${styles.notice} ${styles.noticeError}`}>
          <div className={styles.noticeMessage}>{error}</div>
          <button className={styles.noticeAction} onClick={() => { void load() }}>Retry</button>
        </div>
      ) : null}

      <div className={styles.monitorGrid}>
        <div className="card-action">
          <div className={styles.cardMetric}>
            <div>
              <div className={styles.statNumber}>{data?.health?.ok ? 'OK' : 'Check'}</div>
              <div className={styles.statLabel}>Dependency health</div>
            </div>
          </div>
          <div className={styles.monitorDependencyList}>
            {Object.entries(data?.health?.dependencies || {}).map(([name, status]) => (
              <div key={name} className={styles.monitorRow}>
                <div>
                  <div className={styles.titleStrong}>{name}</div>
                  <div className={styles.smallMuted}>{status.latencyMs != null ? `${status.latencyMs} ms` : (status.error || 'No sample yet')}</div>
                </div>
                <span className={`${styles.monitorStatusBadge} ${toneClass(status.ok ? 'ok' : 'critical')}`}>{status.ok ? 'ok' : 'critical'}</span>
              </div>
            ))}
          </div>
          {data?.health?.missing?.length ? <div className={styles.monitorCallout}>Missing config: {data.health.missing.join(', ')}</div> : null}
        </div>

        <div className="card-action">
          <div className={styles.cardMetric}>
            <div>
              <div className={styles.statNumber}>{data?.abuse?.overallStatus || '...'}</div>
              <div className={styles.statLabel}>Abuse status</div>
            </div>
          </div>
          <div className={styles.monitorMetricList}>
            {Object.entries(data?.abuse?.summary || {}).map(([name, value]) => (
              <div key={name} className={styles.monitorRow}>
                <div>
                  <div className={styles.titleStrong}>{name}</div>
                  <div className={styles.smallMuted}>Current count: {value}</div>
                </div>
                <span className={`${styles.monitorStatusBadge} ${toneClass(data?.abuse?.statuses?.[name] || 'unknown')}`}>{data?.abuse?.statuses?.[name] || 'unknown'}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="card-action">
          <div className={styles.cardMetric}>
            <div>
              <div className={styles.statNumber}>Media</div>
              <div className={styles.statLabel}>Storage policy</div>
            </div>
          </div>
          <div className={styles.monitorPolicyList}>
            <div className={styles.monitorCallout}>{data?.storagePolicy?.target || 'Store all non-logo images in object storage (S3/MinIO).'}</div>
            <div className={styles.smallMuted}>{data?.storagePolicy?.exception || 'Brand/logo assets can remain in app files when they are static build assets.'}</div>
          </div>
        </div>
      </div>
    </main>
  )
}