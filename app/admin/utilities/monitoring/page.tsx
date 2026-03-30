"use client"

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import MonitoringSparkline from '@/components/admin/MonitoringSparkline'
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
    thresholds: Record<string, { warn: number; critical: number }>
    explanations: Record<string, string>
    trends: Record<string, Array<{ label: string; startedAt: string; value: number }>>
  }
  storage: {
    status: 'ok' | 'warning' | 'critical'
    bucket: string
    totals: {
      objectCount: number
      totalBytes: number
      prefixesTracked: number
      recent24hBytes: number
      recent7dBytes: number
      softLimitBytes: number
      usageRatio: number | null
    }
    prefixes: Array<{
      prefix: string
      objectCount: number
      totalBytes: number
      newestObjectAt: string | null
      recent24hBytes: number
      recent24hObjects: number
    }>
    newestObjectAt: string | null
    topRecentObjects: Array<{ key: string; size: number; lastModified: string | null }>
    trends: {
      last24hBytes: Array<{ label: string; startedAt: string; value: number }>
      last7dBytes: Array<{ label: string; startedAt: string; value: number }>
    }
    explanation?: string
    error?: string
  }
  server: {
    status: 'ok' | 'warning' | 'critical'
    runtime: {
      nodeVersion: string
      platform: string
      hostname: string
      pid: number
      cpuCount: number
    }
    uptimeSeconds: number
    startedAt: string
    memory: {
      rssBytes: number
      heapUsedBytes: number
      heapTotalBytes: number
      externalBytes: number
      arrayBuffersBytes: number
      systemTotalBytes: number
      systemFreeBytes: number
      systemUsedRatio: number
      heapUsedRatio: number
    }
    loadAverage: number[]
    explanations: Record<string, string>
  }
  database: {
    status: 'ok' | 'warning' | 'critical'
    counts: Record<string, number>
    totals: { contentRows: number; accountRows: number }
    health: {
      uptimeSeconds: number
      threadsConnected: number
      threadsRunning: number
      maxConnections: number
      connectionUsageRatio: number
      slowQueries: number
      questions: number
      bytesReceived: number
      bytesSent: number
    }
    recentActivity: Record<string, number>
    lastChange: {
      lastMessageAt: string | null
      lastAdminActionAt: string | null
      lastContentUpdateAt: string | null
    }
    explanations?: Record<string, string>
    error?: string
  }
  redis: {
    status: 'ok' | 'warning' | 'critical'
    backend: {
      redisConfigured: boolean
      redisConnected: boolean
      redisTemporarilyDisabled: boolean
      redisDisabledUntil: string | null
      memoryFallbackEntries: number
    }
    stats?: {
      usedMemoryBytes: number
      usedMemoryPeakBytes: number
      maxMemoryBytes: number
      connectedClients: number
      blockedClients: number
      evictedKeys: number
      keyspaceHits: number
      keyspaceMisses: number
      hitRate: number | null
      opsPerSecond: number
      dbSize: number
    }
    explanations?: Record<string, string>
    error?: string
  }
  analytics: {
    status: 'ok' | 'warning' | 'critical'
    websiteIdConfigured: boolean
    websiteId: string
    checks: Array<{
      name: string
      label: string
      kind: 'http' | 'tcp'
      target: string
      ok: boolean
      status: 'ok' | 'warning' | 'critical'
      latencyMs: number
      details: string
      error?: string
    }>
  }
  endpoints: {
    status: 'ok' | 'warning' | 'critical'
    checks: Array<{
      name: string
      url: string
      status: 'ok' | 'warning' | 'critical'
      ok: boolean
      statusCode: number | null
      latencyMs: number
      certificate?: { validTo: string | null; daysRemaining: number | null } | null
      error?: string
    }>
  }
  maintenance: {
    status: 'ok' | 'warning' | 'critical'
    tasks: Array<{
      name: string
      label: string
      command: string
      href: string
      expectedHours: number
      status: 'ok' | 'warning' | 'critical'
      lastRunAt: string | null
      lastSuccessAt: string | null
      lastRunStatus: string
      ageHours: number | null
      runtimeMs: number | null
      summary: string | null
      error: string | null
    }>
    error?: string
  }
  routes: {
    status: 'ok' | 'warning' | 'critical'
    bucketMinutes: number
    buckets: Array<{ startedAt: string; total: number; values: { requests: number; errors: number } }>
    totals: { requests: number; errors: number }
    topRoutes: Array<{
      route: string
      requests: number
      errors: number
      errorRate: number
      requestTrend: number[]
      errorTrend: number[]
      status: 'ok' | 'warning' | 'critical'
      explanation: string
    }>
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

function formatBytes(value?: number | null) {
  if (value == null || !Number.isFinite(value)) return '--'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let size = value
  let unitIndex = 0
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024
    unitIndex += 1
  }
  const digits = size >= 10 || unitIndex === 0 ? 0 : 1
  return `${size.toFixed(digits)} ${units[unitIndex]}`
}

function formatPercent(value?: number | null) {
  if (value == null || !Number.isFinite(value)) return '--'
  return `${(value * 100).toFixed(1)}%`
}

function formatUptime(value?: number | null) {
  if (value == null || !Number.isFinite(value)) return '--'
  const totalSeconds = Math.max(0, Math.floor(value))
  const days = Math.floor(totalSeconds / 86400)
  const hours = Math.floor((totalSeconds % 86400) / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  if (days > 0) return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
}

function formatMetricName(name: string) {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
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

  const overallHighlights = [
    { label: 'Dependencies', value: data?.health?.ok ? 'OK' : 'Check', status: data?.health?.ok ? 'ok' : 'critical' },
    { label: 'Route activity', value: `${data?.routes?.totals?.requests ?? 0}`, status: data?.routes?.status || 'unknown' },
    { label: 'Maintenance', value: data?.maintenance?.status || '...', status: data?.maintenance?.status || 'unknown' },
    { label: 'Analytics', value: data?.analytics?.status || '...', status: data?.analytics?.status || 'unknown' },
  ]

  return (
    <main className={styles.utilityPage}>
      <div className={styles.pageHeader}>
        <div className={styles.pageTitleGroup}>
          <h1 className={styles.pageTitle}>Monitoring</h1>
          <div className={styles.pageSubtitle}>Live dependency health, route activity, abuse trends, storage growth, maintenance history, and endpoint checks for the admin console.</div>
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
        {overallHighlights.map((item) => (
          <div key={item.label} className="card-action">
            <div className={styles.cardMetric}>
              <div>
                <div className={styles.statNumber}>{item.value}</div>
                <div className={styles.statLabel}>{item.label}</div>
              </div>
            </div>
            <span className={`${styles.monitorStatusBadge} ${toneClass(item.status)}`}>{item.status}</span>
          </div>
        ))}
      </div>

      <section className={styles.monitorSection}>
        <div className={styles.messagesHeader}>
          <h2 className={styles.titleReset}>Runtime And Dependencies</h2>
          <div className={styles.rowCenter10}>
            <Link href="/admin">Back to dashboard</Link>
          </div>
        </div>
        <div className={styles.monitorGrid}>
          <div className="card-action">
            <div className={styles.cardMetric}><div><div className={styles.statNumber}>{data?.health?.ok ? 'OK' : 'Check'}</div><div className={styles.statLabel}>Dependency health</div></div></div>
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
            {data?.health?.missing?.length ? <div className={styles.monitorCallout}>Missing config: {data.health.missing.join(', ')}</div> : <div className={styles.smallMuted}>Required backend config is present.</div>}
          </div>

          <div className="card-action">
            <div className={styles.cardMetric}><div><div className={styles.statNumber}>{formatUptime(data?.server?.uptimeSeconds)}</div><div className={styles.statLabel}>Server uptime</div></div></div>
            <div className={styles.monitorMetricList}>
              {[
                ['Memory RSS', formatBytes(data?.server?.memory?.rssBytes)],
                ['Heap used', formatBytes(data?.server?.memory?.heapUsedBytes)],
                ['System used', formatPercent(data?.server?.memory?.systemUsedRatio)],
                ['Heap used %', formatPercent(data?.server?.memory?.heapUsedRatio)],
                ['Node', data?.server?.runtime?.nodeVersion || '--'],
                ['Host', data?.server?.runtime?.hostname || '--'],
              ].map(([label, value]) => (
                <div key={String(label)} className={styles.monitorRow}>
                  <div>
                    <div className={styles.titleStrong}>{label}</div>
                    <div className={styles.smallMuted}>{value}</div>
                  </div>
                  <span className={`${styles.monitorStatusBadge} ${toneClass(data?.server?.status || 'unknown')}`}>{data?.server?.status || 'unknown'}</span>
                </div>
              ))}
            </div>
            <div className={styles.smallMuted}>{data?.server?.explanations?.systemMemory}</div>
            <div className={styles.smallMuted}>{data?.server?.startedAt ? `Started ${new Date(data.server.startedAt).toLocaleString()}` : '--'}</div>
          </div>

          <div className="card-action">
            <div className={styles.cardMetric}><div><div className={styles.statNumber}>{data?.redis?.backend?.redisConnected ? 'Live' : 'Fallback'}</div><div className={styles.statLabel}>Redis and limiter state</div></div></div>
            <div className={styles.monitorMetricList}>
              {[
                ['Used memory', formatBytes(data?.redis?.stats?.usedMemoryBytes)],
                ['Clients', data?.redis?.stats?.connectedClients ?? '--'],
                ['Ops / sec', data?.redis?.stats?.opsPerSecond ?? '--'],
                ['Evicted keys', data?.redis?.stats?.evictedKeys ?? '--'],
                ['Hit rate', formatPercent(data?.redis?.stats?.hitRate)],
                ['Fallback entries', data?.redis?.backend?.memoryFallbackEntries ?? '--'],
              ].map(([label, value]) => (
                <div key={String(label)} className={styles.monitorRow}>
                  <div>
                    <div className={styles.titleStrong}>{label}</div>
                    <div className={styles.smallMuted}>{value}</div>
                  </div>
                  <span className={`${styles.monitorStatusBadge} ${toneClass(data?.redis?.status || 'unknown')}`}>{data?.redis?.status || 'unknown'}</span>
                </div>
              ))}
            </div>
            {data?.redis?.error ? <div className={styles.monitorCallout}>{data.redis.error}</div> : null}
            <div className={styles.smallMuted}>{data?.redis?.explanations?.memory}</div>
            <div className={styles.smallMuted}>{data?.redis?.backend?.redisDisabledUntil ? `Disabled until ${new Date(data.redis.backend.redisDisabledUntil).toLocaleString()}` : data?.redis?.explanations?.fallback}</div>
          </div>

          <div className="card-action">
            <div className={styles.cardMetric}><div><div className={styles.statNumber}>{data?.analytics?.status || '...'}</div><div className={styles.statLabel}>Self-hosted analytics services</div></div></div>
            <div className={styles.monitorMetricList}>
              {(data?.analytics?.checks || []).map((check) => (
                <div key={check.name} className={styles.monitorRow}>
                  <div>
                    <div className={styles.titleStrong}>{check.label}</div>
                    <div className={styles.smallMuted}>{check.target}</div>
                    <div className={styles.smallMuted}>{check.details}{check.latencyMs ? `, ${check.latencyMs} ms` : ''}</div>
                    {check.error ? <div className={styles.smallMuted}>{check.error}</div> : null}
                  </div>
                  <span className={`${styles.monitorStatusBadge} ${toneClass(check.status)}`}>{check.status}</span>
                </div>
              ))}
            </div>
            <div className={styles.smallMuted}>{data?.analytics?.websiteIdConfigured ? `Website ID configured: ${data.analytics.websiteId}` : 'Umami website ID is not configured.'}</div>
          </div>

          <div className="card-action">
            <div className={styles.cardMetric}><div><div className={styles.statNumber}>{data?.endpoints?.status || '...'}</div><div className={styles.statLabel}>Public and internal endpoint checks</div></div></div>
            <div className={styles.monitorMetricList}>
              {(data?.endpoints?.checks || []).map((check) => (
                <div key={check.name} className={styles.monitorRow}>
                  <div>
                    <div className={styles.titleStrong}>{check.name}</div>
                    <div className={styles.smallMuted}>{check.url}</div>
                    <div className={styles.smallMuted}>{check.statusCode != null ? `HTTP ${check.statusCode}, ${check.latencyMs} ms` : check.error || 'No status'}</div>
                    {check.certificate?.daysRemaining != null ? <div className={styles.smallMuted}>Cert expires in {check.certificate.daysRemaining} days</div> : null}
                  </div>
                  <span className={`${styles.monitorStatusBadge} ${toneClass(check.status)}`}>{check.status}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className={styles.monitorSection}>
        <div className={styles.messagesHeader}>
          <h2 className={styles.titleReset}>Traffic And Abuse</h2>
          <div className={styles.rowCenter10}>
            <Link href="/admin/locks">Locks</Link>
            <Link href="/admin/messages">Messages</Link>
            <Link href="/admin/audit">Audit</Link>
          </div>
        </div>
        <div className={styles.monitorGrid}>
          <div className="card-action">
            <div className={styles.cardMetric}><div><div className={styles.statNumber}>{data?.routes?.totals?.requests ?? 0}</div><div className={styles.statLabel}>Observed route requests / {data?.routes?.bucketMinutes ?? 0}m buckets</div></div></div>
            <div className={styles.monitorChartWrap}><MonitoringSparkline values={(data?.routes?.buckets || []).map((bucket) => bucket.values.requests)} /></div>
            <div className={styles.monitorMetricList}>
              {(data?.routes?.topRoutes || []).map((route) => (
                <div key={route.route} className={styles.monitorRouteCard}>
                  <div className={styles.monitorRouteHeader}>
                    <div>
                      <div className={styles.titleStrong}>{route.route}</div>
                      <div className={styles.smallMuted}>{route.requests} requests, {route.errors} errors, {formatPercent(route.errorRate)}</div>
                    </div>
                    <span className={`${styles.monitorStatusBadge} ${toneClass(route.status)}`}>{route.status}</span>
                  </div>
                  <div className={styles.monitorRouteCharts}>
                    <MonitoringSparkline values={route.requestTrend} stroke="#60a5fa" fill="rgba(96,165,250,0.14)" />
                    <MonitoringSparkline values={route.errorTrend} stroke="#f97316" fill="rgba(249,115,22,0.14)" />
                  </div>
                  <div className={styles.smallMuted}>{route.explanation}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="card-action">
            <div className={styles.cardMetric}><div><div className={styles.statNumber}>{data?.abuse?.overallStatus || '...'}</div><div className={styles.statLabel}>Abuse thresholds and trends</div></div></div>
            <div className={styles.monitorMetricList}>
              {Object.entries(data?.abuse?.summary || {}).map(([name, value]) => (
                <div key={name} className={styles.monitorRow}>
                  <div>
                    <div className={styles.titleStrong}>{formatMetricName(name)}</div>
                    <div className={styles.smallMuted}>Current count: {value}</div>
                    <div className={styles.smallMuted}>{data?.abuse?.explanations?.[name] || '--'}</div>
                  </div>
                  <span className={`${styles.monitorStatusBadge} ${toneClass(data?.abuse?.statuses?.[name] || 'unknown')}`}>{data?.abuse?.statuses?.[name] || 'unknown'}</span>
                </div>
              ))}
            </div>
            <div className={styles.monitorChartGrid}>
              {Object.entries(data?.abuse?.trends || {}).map(([name, series]) => (
                <div key={name} className={styles.monitorMiniChartCard}>
                  <div className={styles.titleStrong}>{formatMetricName(name)}</div>
                  <MonitoringSparkline values={series.map((point) => point.value)} />
                  <div className={styles.smallMuted}>Last {series.length} hourly buckets</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className={styles.monitorSection}>
        <div className={styles.messagesHeader}>
          <h2 className={styles.titleReset}>Data And Storage</h2>
          <div className={styles.rowCenter10}>
            <Link href="/admin/projects">Projects</Link>
            <Link href="/admin/credentials">Credentials</Link>
            <Link href="/admin/pages">Pages</Link>
          </div>
        </div>
        <div className={styles.monitorGrid}>
          <div className="card-action">
            <div className={styles.cardMetric}><div><div className={styles.statNumber}>{formatBytes(data?.storage?.totals?.totalBytes)}</div><div className={styles.statLabel}>Managed storage footprint</div></div></div>
            <div className={styles.monitorMetricList}>
              <div className={styles.monitorRow}><div><div className={styles.titleStrong}>Bucket</div><div className={styles.smallMuted}>{data?.storage?.bucket || 'Not configured'}</div></div><span className={`${styles.monitorStatusBadge} ${toneClass(data?.storage?.status || 'unknown')}`}>{data?.storage?.status || 'unknown'}</span></div>
              <div className={styles.monitorRow}><div><div className={styles.titleStrong}>Objects</div><div className={styles.smallMuted}>{data?.storage?.totals?.prefixesTracked ?? 0} tracked prefixes</div></div><span className={`${styles.monitorStatusBadge} ${toneClass(data?.storage?.status || 'unknown')}`}>{data?.storage?.totals?.objectCount ?? 0}</span></div>
              <div className={styles.monitorRow}><div><div className={styles.titleStrong}>Recent growth / 24h</div><div className={styles.smallMuted}>{formatBytes(data?.storage?.totals?.recent24hBytes)}</div></div><span className={`${styles.monitorStatusBadge} ${toneClass(data?.storage?.status || 'unknown')}`}>{formatPercent(data?.storage?.totals?.usageRatio)}</span></div>
            </div>
            <div className={styles.monitorChartGrid}>
              <div className={styles.monitorMiniChartCard}>
                <div className={styles.titleStrong}>Storage growth / 24h</div>
                <MonitoringSparkline values={(data?.storage?.trends?.last24hBytes || []).map((point) => point.value)} />
              </div>
              <div className={styles.monitorMiniChartCard}>
                <div className={styles.titleStrong}>Storage growth / 7d</div>
                <MonitoringSparkline values={(data?.storage?.trends?.last7dBytes || []).map((point) => point.value)} stroke="#34d399" fill="rgba(52,211,153,0.14)" />
              </div>
            </div>
            <div className={styles.monitorMetricList}>
              {(data?.storage?.prefixes || []).sort((a, b) => b.totalBytes - a.totalBytes).map((entry) => (
                <div key={entry.prefix} className={styles.monitorRow}>
                  <div>
                    <div className={styles.titleStrong}>{entry.prefix}</div>
                    <div className={styles.smallMuted}>{entry.objectCount} objects, +{entry.recent24hObjects} in 24h</div>
                    <div className={styles.smallMuted}>{entry.newestObjectAt ? `Newest ${new Date(entry.newestObjectAt).toLocaleString()}` : 'No objects yet'}</div>
                  </div>
                  <span className={`${styles.monitorStatusBadge} ${toneClass(data?.storage?.status || 'unknown')}`}>{formatBytes(entry.totalBytes)}</span>
                </div>
              ))}
            </div>
            <div className={styles.smallMuted}>{data?.storage?.explanation || data?.storage?.error || '--'}</div>
            <div className={styles.monitorCallout}>{data?.storagePolicy?.target || 'Store all non-logo images in object storage (S3/MinIO).'}</div>
            <div className={styles.smallMuted}>{data?.storagePolicy?.exception || 'Brand/logo assets can remain in app files when they are static build assets.'}</div>
          </div>

          <div className="card-action">
            <div className={styles.cardMetric}><div><div className={styles.statNumber}>{data?.database?.totals?.contentRows ?? 0}</div><div className={styles.statLabel}>Database footprint and change context</div></div></div>
            <div className={styles.monitorMetricList}>
              {Object.entries(data?.database?.counts || {}).map(([name, value]) => (
                <div key={name} className={styles.monitorRow}>
                  <div>
                    <div className={styles.titleStrong}>{formatMetricName(name)}</div>
                    <div className={styles.smallMuted}>Current count: {value}</div>
                  </div>
                  <span className={`${styles.monitorStatusBadge} ${toneClass(data?.database?.status || 'unknown')}`}>{data?.database?.status || 'unknown'}</span>
                </div>
              ))}
            </div>
            <div className={styles.monitorMetricList}>
              {[
                ['Connections used', formatPercent(data?.database?.health?.connectionUsageRatio)],
                ['Threads connected', data?.database?.health?.threadsConnected ?? '--'],
                ['Slow queries', data?.database?.health?.slowQueries ?? '--'],
                ['Recent messages / 24h', data?.database?.recentActivity?.messages_24h ?? '--'],
                ['Admin actions / 24h', data?.database?.recentActivity?.admin_actions_24h ?? '--'],
                ['Last content update', data?.database?.lastChange?.lastContentUpdateAt ? new Date(data.database.lastChange.lastContentUpdateAt).toLocaleString() : '--'],
              ].map(([label, value]) => (
                <div key={String(label)} className={styles.monitorRow}>
                  <div>
                    <div className={styles.titleStrong}>{label}</div>
                    <div className={styles.smallMuted}>{value}</div>
                  </div>
                  <span className={`${styles.monitorStatusBadge} ${toneClass(data?.database?.status || 'unknown')}`}>{data?.database?.status || 'unknown'}</span>
                </div>
              ))}
            </div>
            {data?.database?.error ? <div className={styles.monitorCallout}>{data.database.error}</div> : null}
            <div className={styles.smallMuted}>{data?.database?.explanations?.connections}</div>
          </div>
        </div>
      </section>

      <section className={styles.monitorSection}>
        <div className={styles.messagesHeader}>
          <h2 className={styles.titleReset}>Maintenance</h2>
          <div className={styles.rowCenter10}>
            <span className={`${styles.monitorStatusBadge} ${toneClass(data?.maintenance?.status || 'unknown')}`}>{data?.maintenance?.status || 'unknown'}</span>
          </div>
        </div>
        <div className={styles.monitorGrid}>
          {(data?.maintenance?.tasks || []).map((task) => (
            <div key={task.name} className="card-action">
              <div className={styles.monitorRouteHeader}>
                <div>
                  <div className={styles.titleStrong}>{task.label}</div>
                  <div className={styles.smallMuted}>{task.command}</div>
                </div>
                <span className={`${styles.monitorStatusBadge} ${toneClass(task.status)}`}>{task.status}</span>
              </div>
              <div className={styles.smallMuted}>Last run: {task.lastRunAt ? new Date(task.lastRunAt).toLocaleString() : 'Never recorded'}</div>
              <div className={styles.smallMuted}>Last success: {task.lastSuccessAt ? new Date(task.lastSuccessAt).toLocaleString() : 'No successful run yet'}</div>
              <div className={styles.smallMuted}>Expected at least every {task.expectedHours}h</div>
              {task.summary ? <div className={styles.monitorCallout}>{task.summary}</div> : null}
              {task.error ? <div className={styles.monitorCallout}>{task.error}</div> : null}
              <Link href={task.href}>Open related admin area</Link>
            </div>
          ))}
        </div>
      </section>
    </main>
  )
}