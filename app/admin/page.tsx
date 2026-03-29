"use client"

import React, { useEffect, useState, useRef } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useSession, signIn, signOut } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import styles from './admin.module.css'
import AdminLoadingState from '@/components/admin/AdminLoadingState'
import { buildPublicUrl } from '@/lib/s3'

type DashboardMessage = {
  id: number
  name?: string | null
  email?: string | null
  message?: string | null
  is_read?: boolean
  created_at?: string
}

type MonitoringDependency = {
  ok: boolean
  error?: string
  latencyMs?: number
}

type MonitoringSnapshot = {
  generatedAt: string
  health: {
    ok: boolean
    missing: string[]
    dependencies: {
      mysql: MonitoringDependency
      redis: MonitoringDependency
      objectStorage: MonitoringDependency
    }
  }
  abuse: {
    overallStatus: 'ok' | 'warning' | 'critical'
    summary: {
      failedLogins10m: number
      contactMessages10m: number
      contactAbuse10m: number
      passwordResets10m: number
      adminUnlocks24h: number
      suspiciousAdminActions24h: number
    }
    statuses: Record<string, 'ok' | 'warning' | 'critical'>
  }
  storage: {
    status: 'ok' | 'warning' | 'critical'
    bucket: string
    totals: {
      objectCount: number
      totalBytes: number
      prefixesTracked: number
    }
    prefixes: Array<{
      prefix: string
      objectCount: number
      totalBytes: number
      newestObjectAt: string | null
    }>
    newestObjectAt: string | null
    error?: string
  }
  server: {
    status: 'ok' | 'warning' | 'critical'
    runtime: {
      nodeVersion: string
      platform: string
      hostname: string
      pid: number
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
    }
    loadAverage: number[]
  }
  database: {
    status: 'ok' | 'warning' | 'critical'
    counts: {
      projects: number
      pages: number
      aboutCards: number
      credentials: number
      credentialSections: number
      messages: number
      unreadMessages: number
      users: number
    }
    totals: {
      contentRows: number
      accountRows: number
    }
    error?: string
  }
  redis: {
    status: 'ok' | 'warning' | 'critical'
    backend: {
      redisConnected: boolean
      redisTemporarilyDisabled: boolean
      memoryFallbackEntries: number
    }
  }
  endpoints: {
    status: 'ok' | 'warning' | 'critical'
    checks: Array<{
      name: string
      latencyMs: number
      status: 'ok' | 'warning' | 'critical'
      statusCode: number | null
    }>
  }
  maintenance: {
    status: 'ok' | 'warning' | 'critical'
    tasks: Array<{
      label: string
      status: 'ok' | 'warning' | 'critical'
      lastRunAt: string | null
      summary: string | null
    }>
  }
  routes: {
    status: 'ok' | 'warning' | 'critical'
    totals: {
      requests: number
      errors: number
    }
    topRoutes: Array<{
      route: string
      requests: number
      errors: number
      errorRate: number
      status: 'ok' | 'warning' | 'critical'
    }>
  }
  storagePolicy: {
    target: string
    exception: string
  }
}

function statusTone(status: 'ok' | 'warning' | 'critical' | 'unknown') {
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

export default function AdminPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [counts, setCounts] = useState({ projects: 0, messages: 0, users: 0, aboutPosts: 0 })
  const [recentMessages, setRecentMessages] = useState<DashboardMessage[]>([])
  const [featuredHero, setFeaturedHero] = useState<{ url?: string; title?: string } | null>(null)
  const [onAir, setOnAir] = useState<boolean | null>(null)
  const [onairSaving, setOnairSaving] = useState(false)
  const [onairError, setOnairError] = useState<string | null>(null)
  const [onairUpdatedAt, setOnairUpdatedAt] = useState<string | null>(null)
  const [monitoring, setMonitoring] = useState<MonitoringSnapshot | null>(null)
  const [monitoringError, setMonitoringError] = useState<string | null>(null)
  const [monitoringRefreshing, setMonitoringRefreshing] = useState(false)

  const mountedRef = useRef(true)
  const topStoragePrefixes = [...(monitoring?.storage?.prefixes || [])].sort((a, b) => b.totalBytes - a.totalBytes).slice(0, 3)

  const fetchDashboard = async () => {
    try {
      const res = await fetch('/admin/dashboard-data', { cache: 'no-store' })
      const j = await res.json().catch(() => ({ counts: null, recentMessages: [] }))
      if (!mountedRef.current) return
      setCounts({
        projects: Number(j?.counts?.projects ?? 0),
        messages: Number(j?.counts?.messages ?? 0),
        users: Number(j?.counts?.users ?? 0),
        aboutPosts: Number(j?.counts?.aboutPosts ?? 0)
      })
      setRecentMessages(Array.isArray(j?.recentMessages) ? j.recentMessages.slice(0, 5) : [])
    } catch {
      if (!mountedRef.current) return
      setRecentMessages([])
    }
  }

  const fetchOnAir = async () => {
    try {
      const r = await fetch('/admin/onair', { cache: 'no-store' })
      const j = await r.json()
      if (!mountedRef.current) return
      const isOn = j?.item && (j.item.is_on === 1 || j.item.is_on === true)
      setOnAir(Boolean(isOn))
      if (j?.item?.updated_at) setOnairUpdatedAt(String(j.item.updated_at))
    } catch {
      // ignore
    }
  }

  const fetchFeaturedHero = async () => {
    try {
      const r = await fetch('/api/hero')
      const j = await r.json()
      if (!mountedRef.current) return
      const h = j?.hero || null
      const imgs = Array.isArray(j?.images) ? (j.images as Array<Record<string, unknown>>) : []
      const f = imgs.find((i) => Number((i as Record<string, unknown>).is_featured) === 1) || imgs[0] || null
      if (!f) return
      const url = String((f as Record<string, unknown>).url || '')
      const title = String(h?.title || '')
      setFeaturedHero({ url, title })
    } catch {
      // ignore
    }
  }

  const fetchMonitoring = async () => {
    setMonitoringRefreshing(true)
    try {
      const res = await fetch('/admin/monitoring', { cache: 'no-store' })
      const j = await res.json().catch(() => null)
      if (!mountedRef.current) return
      if (!res.ok) {
        setMonitoringError((j && typeof j.error === 'string') ? j.error : 'Failed to load monitoring status')
        return
      }
      setMonitoring(j as MonitoringSnapshot)
      setMonitoringError(null)
    } catch (error) {
      if (!mountedRef.current) return
      setMonitoringError(error instanceof Error ? error.message : String(error))
    } finally {
      if (mountedRef.current) setMonitoringRefreshing(false)
    }
  }

  useEffect(()=>{
    const dashboardTimeoutId = window.setTimeout(() => { void fetchDashboard() }, 0)
    const featuredHeroTimeoutId = window.setTimeout(() => { void fetchFeaturedHero() }, 0)
    const timeoutId = window.setTimeout(() => { void fetchOnAir() }, 0)
    const monitoringTimeoutId = window.setTimeout(() => { void fetchMonitoring() }, 0)
    const pollId = window.setInterval(() => { void fetchDashboard(); void fetchMonitoring() }, 30000)
    return () => {
      window.clearTimeout(dashboardTimeoutId)
      window.clearTimeout(featuredHeroTimeoutId)
      window.clearTimeout(timeoutId)
      window.clearTimeout(monitoringTimeoutId)
      window.clearInterval(pollId)
    }
  }, [])

  function getPreviewSrc(urlVal: unknown) {
    if (!urlVal) return ''
    const u = String(urlVal)
    if (u.startsWith('/')) return u
    if (/^https?:\/\//i.test(u)) {
      try {
        const parsed = new URL(u)
        const pclean = (parsed.pathname || '').replace(/^\//, '')
        const bucket = (process.env.NEXT_PUBLIC_S3_BUCKET || '').trim() || pclean.split('/')[0] || ''
        if (bucket && pclean.startsWith(bucket + '/')) {
          const key = pclean.slice(bucket.length + 1)
          return buildPublicUrl(key)
        }
        return u
      } catch { return u }
    }
    return buildPublicUrl(u)
  }

  async function toggleOnAir() {
    setOnairError(null)
    setOnairSaving(true)
    try {
      const newState = !onAir
      const res = await fetch('/admin/onair', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ is_on: newState ? 1 : 0, updated_by: session?.user?.email || null }) })
      const j = await res.json()
      if (res.ok && j?.item) setOnAir(Boolean(j.item.is_on))
      else setOnairError(j?.error || 'Failed to update')
    } catch (e) {
      setOnairError(String(e))
    }
    setOnairSaving(false)
  }

  // Poll on-air state periodically so admin sees recent status (every 10 minutes)
  useEffect(() => {
    mountedRef.current = true
    const id = setInterval(() => { if (!mountedRef.current) return; fetchOnAir() }, 10 * 60 * 1000)
    return () => { mountedRef.current = false; clearInterval(id) }
  }, [])

  if (status === 'loading') return <AdminLoadingState label="Loading admin console" />
  if (!session) {
    return (
      <div className={styles.emptyStateCard}>
        <h2 className={styles.pageTitle}>Admin</h2>
        <p>You must be signed in to access the admin console.</p>
        <div className="flex gap-2">
          <button className={styles.btnGhost} onClick={() => signIn()}>Sign In</button>
          <button className={styles.btnGhost} onClick={() => router.push('/')}>Go Home</button>
        </div>
      </div>
    )
  }

  return (
    <main className={styles.pageBody}>
          <h2>Admin Console</h2>
          <div className={`${styles.rowCenter12} ${styles.sectionSpacing}`}>
            <div className={styles.flex1}>
              <div className={styles.titleStrong}>On Air</div>
              <div className={styles.smallMuted}>Toggle whether the public site shows the On Air indicator.</div>
            </div>
            <div className={styles.rowCenter8}>
              <label className={styles.switch}>
                <input type="checkbox" checked={Boolean(onAir)} onChange={toggleOnAir} disabled={onairSaving} />
                <div className={`${styles.slider} ${onAir ? styles.on : ''}`}></div>
              </label>
              <div className={styles.statusPanel}>
                <div className={styles.titleExtraStrong}>{onAir ? 'On Air' : 'Standby'}</div>
                {onairError && <div className={styles.smallMutedError}>{onairError}</div>}
                {onairUpdatedAt && (
                  <div className={`${styles.smallMuted} ${styles.metaInline}`}>
                    <div>
                      Last updated: {(() => {
                        try {
                          const d = new Date(String(onairUpdatedAt))
                          if (!isNaN(d.getTime())) return d.toLocaleString()
                        } catch {}
                        try { return String(onairUpdatedAt) } catch { return '' }
                      })()}
                    </div>
                    <button
                      className={`${styles.btnGhost} ${styles.btnGhostSmall}`}
                      onClick={async () => { setOnairError(null); try { await fetchOnAir() } catch (e) { setOnairError(String(e)) } }}
                      disabled={onairSaving}
                    >
                      Refresh
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
          {/* Featured hero preview — full width, centered image */}
          {featuredHero && (
            <div className={styles.heroPreviewSection}>
              <div className={`card-action ${styles.heroPreviewCard}`}>
                <div className={styles.heroPreviewInner}>
                    <div className={styles.heroPreviewImageWrap}>
                    <Image src={getPreviewSrc(featuredHero.url)} alt={featuredHero.title || 'Featured hero'} width={520} height={220} unoptimized className={styles.heroPreviewImage} />
                  </div>
                  <div className={styles.rowCenter12}>
                    <div>
                      <div className={`${styles.statNumber} ${styles.statNumberSmall}`}>Hero</div>
                      <div className={styles.statLabel}>{featuredHero.title || 'Featured image'}</div>
                    </div>
                    <Link prefetch={false} href="/admin/home/hero">Edit Hero</Link>
                  </div>
                </div>
              </div>
            </div>
          )}
          <div className={`${styles.dashboardGrid} ${styles.dashboardGridTop}`}>
            <div className="card-action">
              <div className={styles.cardMetric}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="3" y="4" width="18" height="4" rx="1" fill="#60a5fa"/><rect x="3" y="10" width="12" height="4" rx="1" fill="#a78bfa"/><rect x="3" y="16" width="6" height="4" rx="1" fill="var(--logo-green)"/></svg>
                <div>
                  <div className={styles.statNumber}>{counts.projects}</div>
                  <div className={styles.statLabel}>Projects</div>
                </div>
              </div>
              <Link prefetch={false} href="/admin/projects">Open Projects</Link>
            </div>
              <div className="card-action">
                <div className={styles.cardMetric}>
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="3" y="4" width="18" height="4" rx="1" fill="#60a5fa"/><rect x="3" y="10" width="12" height="4" rx="1" fill="#a78bfa"/><rect x="3" y="16" width="6" height="4" rx="1" fill="var(--logo-green)"/></svg>
                  <div>
                    <div className={styles.statNumber}>{counts.aboutPosts}</div>
                    <div className={styles.statLabel}>About posts</div>
                  </div>
                </div>
                <Link prefetch={false} href="/admin/about">Open About</Link>
              </div>
            <div className="card-action">
              <div className={styles.cardMetric}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M2 7a2 2 0 012-2h16a2 2 0 012 2v8a2 2 0 01-2 2H6l-4 4V7z" fill="#60a5fa"/></svg>
                <div>
                  <div className={styles.statNumber}>{counts.messages}</div>
                  <div className={styles.statLabel}>Messages</div>
                </div>
              </div>
              <Link prefetch={false} href="/admin/messages">Open Messages</Link>
            </div>
            <div className="card-action">
              <div className={styles.cardMetric}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="8" r="3" fill="var(--logo-green)"/><path d="M4 20c0-4 4-6 8-6s8 2 8 6" fill="#60a5fa"/></svg>
                <div>
                  <div className={styles.statNumber}>{counts.users}</div>
                  <div className={styles.statLabel}>Users</div>
                </div>
              </div>
              <Link prefetch={false} href="/admin/users">Manage Users</Link>
            </div>
            <div className="card-action">
              <div className={styles.autoMarginTop}>
                <button onClick={() => signOut()} className={styles.btnGhost}>Sign Out</button>
              </div>
            </div>
          </div>
          <div className={styles.sectionSpacing}>
            <div className={styles.messagesHeader}>
              <h3 className={styles.titleReset}>Live Server Monitoring</h3>
              <div className={styles.rowCenter10}>
                {monitoring?.generatedAt ? <span className={styles.smallMuted}>Updated {new Date(monitoring.generatedAt).toLocaleTimeString()}</span> : null}
                <button className={styles.btnGhost} onClick={() => { void fetchMonitoring() }} disabled={monitoringRefreshing}>Refresh</button>
              </div>
            </div>
            {monitoringError ? (
              <div className={`${styles.notice} ${styles.noticeError}`}>
                <div className={styles.noticeMessage}>{monitoringError}</div>
                <button className={styles.noticeAction} onClick={() => { void fetchMonitoring() }}>Retry</button>
              </div>
            ) : null}
            <div className={styles.monitorGrid}>
              <div className="card-action">
                <div className={styles.cardMetric}>
                  <div>
                    <div className={styles.statNumber}>{monitoring?.health?.ok ? 'OK' : 'Check'}</div>
                    <div className={styles.statLabel}>Dependency health</div>
                  </div>
                </div>
                <div className={styles.monitorDependencyList}>
                  {(['mysql', 'redis', 'objectStorage'] as const).map((key) => {
                    const dependency = monitoring?.health?.dependencies?.[key]
                    const state = dependency ? (dependency.ok ? 'ok' : 'critical') : 'unknown'
                    return (
                      <div key={key} className={styles.monitorRow}>
                        <div>
                          <div className={styles.titleStrong}>{key}</div>
                          <div className={styles.smallMuted}>{dependency?.latencyMs != null ? `${dependency.latencyMs} ms` : 'No sample yet'}</div>
                        </div>
                        <span className={`${styles.monitorStatusBadge} ${statusTone(state)}`}>{state}</span>
                      </div>
                    )
                  })}
                </div>
                {monitoring?.health?.missing?.length ? (
                  <div className={styles.monitorCallout}>Missing config: {monitoring.health.missing.join(', ')}</div>
                ) : (
                  <div className={styles.smallMuted}>Required backend config is present.</div>
                )}
              </div>
              <div className="card-action">
                <div className={styles.cardMetric}>
                  <div>
                    <div className={styles.statNumber}>{formatUptime(monitoring?.server?.uptimeSeconds)}</div>
                    <div className={styles.statLabel}>Server uptime</div>
                  </div>
                </div>
                <div className={styles.monitorMetricList}>
                  {[
                    ['Memory RSS', formatBytes(monitoring?.server?.memory?.rssBytes)],
                    ['Heap used', formatBytes(monitoring?.server?.memory?.heapUsedBytes)],
                    ['Node', monitoring?.server?.runtime?.nodeVersion || '--'],
                    ['Host', monitoring?.server?.runtime?.hostname || '--'],
                  ].map(([label, value]) => (
                    <div key={String(label)} className={styles.monitorRow}>
                      <div>
                        <div className={styles.titleStrong}>{label}</div>
                        <div className={styles.smallMuted}>{value}</div>
                      </div>
                      <span className={`${styles.monitorStatusBadge} ${statusTone(monitoring?.server?.status || 'unknown')}`}>{monitoring?.server?.status || 'unknown'}</span>
                    </div>
                  ))}
                </div>
                <div className={styles.smallMuted}>Started {monitoring?.server?.startedAt ? new Date(monitoring.server.startedAt).toLocaleString() : '--'}</div>
              </div>
              <div className="card-action">
                <div className={styles.cardMetric}>
                  <div>
                    <div className={styles.statNumber}>{monitoring?.abuse?.overallStatus || '...'}</div>
                    <div className={styles.statLabel}>Abuse monitoring</div>
                  </div>
                </div>
                <div className={styles.monitorMetricList}>
                  {[
                    ['Failed logins / 10m', monitoring?.abuse?.summary?.failedLogins10m ?? 0, monitoring?.abuse?.statuses?.failedLogins10m || 'unknown'],
                    ['Contact abuse / 10m', monitoring?.abuse?.summary?.contactAbuse10m ?? 0, monitoring?.abuse?.statuses?.contactAbuse10m || 'unknown'],
                    ['Password resets / 10m', monitoring?.abuse?.summary?.passwordResets10m ?? 0, monitoring?.abuse?.statuses?.passwordResets10m || 'unknown'],
                    ['Admin unlocks / 24h', monitoring?.abuse?.summary?.adminUnlocks24h ?? 0, monitoring?.abuse?.statuses?.adminUnlocks24h || 'unknown'],
                    ['Suspicious admin actions / 24h', monitoring?.abuse?.summary?.suspiciousAdminActions24h ?? 0, monitoring?.abuse?.statuses?.suspiciousAdminActions24h || 'unknown'],
                  ].map(([label, value, tone]) => (
                    <div key={String(label)} className={styles.monitorRow}>
                      <div>
                        <div className={styles.titleStrong}>{label}</div>
                        <div className={styles.smallMuted}>Current count: {value}</div>
                      </div>
                      <span className={`${styles.monitorStatusBadge} ${statusTone(tone as 'ok' | 'warning' | 'critical' | 'unknown')}`}>{tone}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="card-action">
                <div className={styles.cardMetric}>
                  <div>
                    <div className={styles.statNumber}>{formatBytes(monitoring?.storage?.totals?.totalBytes)}</div>
                    <div className={styles.statLabel}>Managed media used</div>
                  </div>
                </div>
                <div className={styles.monitorPolicyList}>
                  {topStoragePrefixes.map((entry) => (
                    <div key={entry.prefix} className={styles.monitorRow}>
                      <div>
                        <div className={styles.titleStrong}>{entry.prefix}</div>
                        <div className={styles.smallMuted}>{entry.objectCount} objects</div>
                      </div>
                      <span className={`${styles.monitorStatusBadge} ${statusTone(monitoring?.storage?.status || 'unknown')}`}>{formatBytes(entry.totalBytes)}</span>
                    </div>
                  ))}
                  {monitoring?.storage?.error ? <div className={styles.monitorCallout}>{monitoring.storage.error}</div> : null}
                  <div className={styles.smallMuted}>{monitoring?.storage?.totals?.objectCount ?? 0} objects across {monitoring?.storage?.totals?.prefixesTracked ?? 0} prefixes.</div>
                  <div className={styles.monitorCallout}>{monitoring?.storagePolicy?.target || 'Store all non-logo images in object storage (S3/MinIO).'}</div>
                  <div className={styles.smallMuted}>{monitoring?.storagePolicy?.exception || 'Brand/logo assets can remain in app files when they are static build assets.'}</div>
                  <Link prefetch={false} href="/admin/projects">Review media-backed content</Link>
                </div>
              </div>
              <div className="card-action">
                <div className={styles.cardMetric}>
                  <div>
                    <div className={styles.statNumber}>{monitoring?.database?.totals?.contentRows ?? 0}</div>
                    <div className={styles.statLabel}>Content rows tracked</div>
                  </div>
                </div>
                <div className={styles.monitorMetricList}>
                  {[
                    ['Projects', monitoring?.database?.counts?.projects ?? 0],
                    ['Pages', monitoring?.database?.counts?.pages ?? 0],
                    ['Credentials', monitoring?.database?.counts?.credentials ?? 0],
                    ['Unread messages', monitoring?.database?.counts?.unreadMessages ?? 0],
                  ].map(([label, value]) => (
                    <div key={String(label)} className={styles.monitorRow}>
                      <div>
                        <div className={styles.titleStrong}>{label}</div>
                        <div className={styles.smallMuted}>Current count: {value}</div>
                      </div>
                      <span className={`${styles.monitorStatusBadge} ${statusTone(monitoring?.database?.status || 'unknown')}`}>{monitoring?.database?.status || 'unknown'}</span>
                    </div>
                  ))}
                </div>
                {monitoring?.database?.error ? <div className={styles.monitorCallout}>{monitoring.database.error}</div> : null}
              </div>
              <div className="card-action">
                <div className={styles.cardMetric}>
                  <div>
                    <div className={styles.statNumber}>{monitoring?.routes?.totals?.requests ?? 0}</div>
                    <div className={styles.statLabel}>Observed route requests</div>
                  </div>
                </div>
                <div className={styles.monitorMetricList}>
                  {(monitoring?.routes?.topRoutes || []).slice(0, 3).map((route) => (
                    <div key={route.route} className={styles.monitorRow}>
                      <div>
                        <div className={styles.titleStrong}>{route.route}</div>
                        <div className={styles.smallMuted}>{route.requests} requests, {route.errors} errors</div>
                      </div>
                      <span className={`${styles.monitorStatusBadge} ${statusTone(route.status)}`}>{route.status}</span>
                    </div>
                  ))}
                </div>
                <Link prefetch={false} href="/admin/utilities/monitoring">Open full route monitoring</Link>
              </div>
              <div className="card-action">
                <div className={styles.cardMetric}>
                  <div>
                    <div className={styles.statNumber}>{monitoring?.maintenance?.status || '...'}</div>
                    <div className={styles.statLabel}>Maintenance status</div>
                  </div>
                </div>
                <div className={styles.monitorMetricList}>
                  {(monitoring?.maintenance?.tasks || []).slice(0, 3).map((task) => (
                    <div key={task.label} className={styles.monitorRow}>
                      <div>
                        <div className={styles.titleStrong}>{task.label}</div>
                        <div className={styles.smallMuted}>{task.lastRunAt ? `Last run ${new Date(task.lastRunAt).toLocaleString()}` : 'Never recorded'}</div>
                      </div>
                      <span className={`${styles.monitorStatusBadge} ${statusTone(task.status)}`}>{task.status}</span>
                    </div>
                  ))}
                </div>
                <div className={styles.smallMuted}>Redis {monitoring?.redis?.backend?.redisConnected ? 'connected' : 'fallback'}; public checks {monitoring?.endpoints?.status || 'unknown'}.</div>
                <Link prefetch={false} href="/admin/utilities/monitoring">Open full maintenance view</Link>
              </div>
            </div>
          </div>
          <div className={styles.sectionSpacing}>
            <div className={styles.messagesHeader}>
              <h3 className={styles.titleReset}>Recent Messages</h3>
              <div className={styles.rowCenter10}>
                <button className={styles.btnGhost} onClick={() => { void fetchDashboard() }}>Refresh</button>
                <Link prefetch={false} href="/admin/messages">Open all messages</Link>
              </div>
            </div>
            {recentMessages.length === 0 ? (
              <div className="card-action">
                <div className={styles.smallMuted}>No messages yet.</div>
              </div>
            ) : (
              <div className={styles.messagesList}>
                {recentMessages.map((item) => (
                  <div key={item.id} className={`card-action ${styles.messageCard}`}>
                    <div className={styles.messageBody}>
                      <div className={styles.messageHeader}>
                        <strong>{item.name || 'Visitor'}</strong>
                        <span className={styles.smallMuted}>{item.email || 'No email provided'}</span>
                        {!item.is_read ? <span className={styles.badgeNew}>New</span> : null}
                      </div>
                      <div className={`${styles.smallMuted} ${styles.messageTimestamp}`}>
                        {item.created_at ? new Date(item.created_at).toLocaleString() : '-'}
                      </div>
                      <div className={styles.messageClamp}>
                        {String(item.message || '').trim() || 'No message body'}
                      </div>
                    </div>
                    <Link prefetch={false} href="/admin/messages">View</Link>
                  </div>
                ))}
              </div>
            )}
          </div>
    </main>
  )
}
