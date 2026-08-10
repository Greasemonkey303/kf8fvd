"use client"

import React, { useEffect, useState } from 'react';
import styles from './dashboard.module.css';
import { Card } from '@/components';

type SpaceWeatherSnapshot = {
  kIndex: number;
  f107: number;
  source: string;
  updatedAt?: string;
}

type BandName = '2m' | '70cm' | '20m' | '40m'
type BandActivityLevel = 'low' | 'fair' | 'good' | 'strong' | 'peak'

type BandActivityCell = {
  score: number;
  level: BandActivityLevel;
  label: string;
}

type BandActivitySummary = {
  band: BandName;
  focus: string;
  detail: string;
  bestSlot: typeof BAND_TIME_SLOTS[number];
  bestCell: BandActivityCell | null;
  averageLevel: BandActivityLevel | null;
}

const BAND_ORDER: BandName[] = ['2m', '70cm', '20m', '40m']
const BAND_TIME_SLOTS = ['00', '06', '12', '18'] as const

const BAND_ACTIVITY_LABELS: Record<BandActivityLevel, string> = {
  low: 'Low',
  fair: 'Fair',
  good: 'Good',
  strong: 'Strong',
  peak: 'Peak',
}

const BAND_ACTIVITY_PROFILES: Record<BandName, number[]> = {
  '2m': [0.68, 0.58, 0.54, 0.92],
  '70cm': [0.62, 0.56, 0.52, 0.88],
  '20m': [0.42, 0.58, 0.94, 0.72],
  '40m': [0.86, 0.55, 0.38, 0.79],
}

const BAND_ACTIVITY_NOTES: Record<BandName, { focus: string; detail: string }> = {
  '2m': {
    focus: 'Local FM',
    detail: 'Repeaters, simplex checks, and dependable local coverage.',
  },
  '70cm': {
    focus: 'UHF links',
    detail: 'Hotspot work, short-hop paths, and cleaner urban coverage.',
  },
  '20m': {
    focus: 'Daylight HF',
    detail: 'Regional and DX windows when solar flux is doing the heavy lifting.',
  },
  '40m': {
    focus: 'Evening HF',
    detail: 'Regional nets, late-day ragchew, and steadier after-sunset work.',
  },
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function normalizeSpaceWeather(value: unknown): SpaceWeatherSnapshot {
  const record = value && typeof value === 'object' ? value as Record<string, unknown> : {}
  const kIndex = Number(record.kIndex ?? 3)
  const f107 = Number(record.f107 ?? 92)
  const source = typeof record.source === 'string' && record.source.trim() ? record.source.trim() : 'fallback'
  const updatedAt = typeof record.updatedAt === 'string' && record.updatedAt.trim() ? record.updatedAt.trim() : undefined

  return {
    kIndex: Number.isFinite(kIndex) ? kIndex : 3,
    f107: Number.isFinite(f107) ? f107 : 92,
    source,
    updatedAt,
  }
}

function getBandActivityLevel(score: number): BandActivityLevel {
  if (score < 0.28) return 'low'
  if (score < 0.45) return 'fair'
  if (score < 0.62) return 'good'
  if (score < 0.8) return 'strong'
  return 'peak'
}

function buildBandActivityGrid(space: SpaceWeatherSnapshot): Record<BandName, BandActivityCell[]> {
  const k = clamp(Number(space.kIndex || 3), 0, 9)
  const f = clamp(Number(space.f107 || 92), 60, 230)
  const fNorm = clamp((f - 65) / 155, 0, 1)

  return Object.fromEntries(
    BAND_ORDER.map((band) => {
      const isHf = band === '20m' || band === '40m'
      const quietFactor = isHf
        ? clamp(1 - (k / 9) * 0.78, 0.24, 1)
        : clamp(1 - (k / 9) * 0.32, 0.58, 1)
      const solarFactor = isHf ? 0.45 + fNorm * 0.78 : 0.7 + fNorm * 0.18
      const bandBase = band === '20m' ? 0.42 : band === '40m' ? 0.48 : band === '2m' ? 0.56 : 0.5

      const cells = BAND_ACTIVITY_PROFILES[band].map((profile) => {
        const score = clamp((bandBase + profile * 0.52) * solarFactor * quietFactor, 0.14, 0.96)
        const level = getBandActivityLevel(score)
        return {
          score,
          level,
          label: BAND_ACTIVITY_LABELS[level],
        }
      })

      return [band, cells]
    })
  ) as Record<BandName, BandActivityCell[]>
}

function summarizeBandActivityGrid(bandGrid: Record<BandName, BandActivityCell[]> | null): BandActivitySummary[] {
  return BAND_ORDER.map((band) => {
    const cells = bandGrid?.[band] ?? []
    let bestIndex = 0
    let bestCell: BandActivityCell | null = null
    let totalScore = 0

    cells.forEach((cell, index) => {
      totalScore += cell.score
      if (!bestCell || cell.score > bestCell.score) {
        bestCell = cell
        bestIndex = index
      }
    })

    const averageScore = cells.length ? totalScore / cells.length : 0

    return {
      band,
      focus: BAND_ACTIVITY_NOTES[band].focus,
      detail: BAND_ACTIVITY_NOTES[band].detail,
      bestSlot: BAND_TIME_SLOTS[bestIndex],
      bestCell,
      averageLevel: cells.length ? getBandActivityLevel(averageScore) : null,
    }
  })
}

function getBandActivityClass(level: BandActivityLevel | null) {
  if (level === 'low') return styles.heatCellLow
  if (level === 'fair') return styles.heatCellFair
  if (level === 'good') return styles.heatCellGood
  if (level === 'strong') return styles.heatCellStrong
  if (level === 'peak') return styles.heatCellPeak
  return styles.heatCellUnknown
}

function getLegendSwatchClass(level: BandActivityLevel) {
  if (level === 'low') return styles.legendSwatchLow
  if (level === 'fair') return styles.legendSwatchFair
  if (level === 'good') return styles.legendSwatchGood
  if (level === 'strong') return styles.legendSwatchStrong
  return styles.legendSwatchPeak
}

function getActivityToneClass(level: BandActivityLevel | null) {
  if (level === 'low') return styles.activityToneLow
  if (level === 'fair') return styles.activityToneFair
  if (level === 'good') return styles.activityToneGood
  if (level === 'strong') return styles.activityToneStrong
  if (level === 'peak') return styles.activityTonePeak
  return styles.activityToneUnknown
}

function Clock() {
  const [now, setNow] = useState<Date | null>(null);
  const [width, setWidth] = useState<number | null>(null);

  useEffect(() => {
    // Defer creating a Date / reading window until after mount so
    // the server-rendered HTML (placeholder) matches the client's
    // initial render and avoids hydration mismatches.
    // Make initial updates async to avoid synchronous setState in effect
    const init = setTimeout(() => {
      setNow(new Date());
      setWidth(window.innerWidth);
    }, 0);
    const id = setInterval(() => setNow(new Date()), 1000);
    const onResize = () => setWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => { clearInterval(id); clearTimeout(init); window.removeEventListener('resize', onResize); };
  }, []);

  const cities = [
    {name:'New York', tz:'America/New_York', flag:'🇺🇸'},
    {name:'Los Angeles', tz:'America/Los_Angeles', flag:'🇺🇸'},
    {name:'London', tz:'Europe/London', flag:'🇬🇧'},
    {name:'Paris', tz:'Europe/Paris', flag:'🇫🇷'},
    {name:'Berlin', tz:'Europe/Berlin', flag:'🇩🇪'},
    {name:'Moscow', tz:'Europe/Moscow', flag:'🇷🇺'},
    {name:'Dubai', tz:'Asia/Dubai', flag:'🇦🇪'},
    {name:'Mumbai', tz:'Asia/Kolkata', flag:'🇮🇳'},
    {name:'Beijing', tz:'Asia/Shanghai', flag:'🇨🇳'},
    {name:'Tokyo', tz:'Asia/Tokyo', flag:'🇯🇵'},
    {name:'Sydney', tz:'Australia/Sydney', flag:'🇦🇺'},
    {name:'Singapore', tz:'Asia/Singapore', flag:'🇸🇬'},
    {name:'São Paulo', tz:'America/Sao_Paulo', flag:'🇧🇷'},
    {name:'Mexico City', tz:'America/Mexico_City', flag:'🇲🇽'},
    {name:'Johannesburg', tz:'Africa/Johannesburg', flag:'🇿🇦'},
    {name:'Cairo', tz:'Africa/Cairo', flag:'🇪🇬'},
  ];

  // On small viewports, only show primary major cities to keep a single-row layout
  const majorNames = new Set(['New York','Los Angeles','London','Tokyo']);
  const displayed = (width !== null && width <= 720) ? cities.filter(c => majorNames.has(c.name)) : cities;
  const localTime = now
    ? now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
    : '—:—:—'
  const localDate = now
    ? now.toLocaleDateString([], { month: 'short', day: '2-digit', year: 'numeric' })
    : ''

  return (
    <div className={styles.clock} aria-hidden>
      <div className={styles.callsign}>KF8FVD</div>
      <div className={styles.time}>{localTime}</div>
      <div className={styles.utc}>{now ? `UTC ${now.toISOString().slice(11,19)}` : ''}</div>
      <div className={styles.tz}>{localDate}</div>
      <div className={styles.citiesGrid} aria-hidden>
        {displayed.map((c) => {
          const cityTime = now
            ? new Intl.DateTimeFormat([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, timeZone: c.tz }).format(now)
            : '—:—:—'
          return (
            <div key={c.tz} className={styles.cityItem} data-timezone={c.tz}>
                <div className={styles.cityHeader}>
                  <div className={styles.cityName}>{c.flag} {c.name}</div>
                <div className={styles.cityTz}>{now ? new Intl.DateTimeFormat(undefined, { timeZoneName: 'short', timeZone: c.tz }).format(now).split(' ').pop() : ''}</div>
              </div>
              <div className={styles.cityTime}>{cityTime}</div>
            </div>
          )
        })}
      </div>
    </div>
  );
}

function useOnAirState() {
  const [onAir, setOnAir] = useState<boolean | null>(null);
  useEffect(() => {
    let mounted = true
    const fallbackCheck = () => {
      const h = new Date().getUTCHours()
      if (!mounted) return
      setOnAir(h >= 18 && h <= 20)
    }

    const fetchState = async () => {
      try {
        const r = await fetch('/api/onair')
        if (!r.ok) throw new Error('no onair')
        const j = await r.json()
        if (!mounted) return
        const isOn = j?.item && (j.item.is_on === 1 || j.item.is_on === true)
        setOnAir(Boolean(isOn))
      } catch {
        // fallback to heuristic when API unavailable
        fallbackCheck()
      }
    }

    fetchState()
    const id = setInterval(fetchState, 30_000)
    return () => { mounted = false; clearInterval(id) }
  }, [])

  return onAir
}

function OnAirBadge({ onAir }: { onAir: boolean | null }) {
  const stateClass = onAir === null ? '' : (onAir ? styles.onAirActive : styles.off)
  const cls = `${styles.badge} ${stateClass} ${styles.onAirBadge}`.trim()
  return (
    <div className={cls}>
      {onAir === null ? '…' : onAir ? 'On Air' : 'Standby'}
    </div>
  );
}

interface QsoEntry {
  call: string;
  date?: string;
  time?: string;
  band?: string;
  mode?: string;
  qth?: string;
  city?: string;
  state?: string;
  country?: string;
  display?: string;
}

export default function Dashboard() {
  const onAir = useOnAirState()
  const [space, setSpace] = useState<SpaceWeatherSnapshot | null>(null);
  const [qsos, setQsos] = useState<QsoEntry[] | null>(null);
  const [bandGrid, setBandGrid] = useState<Record<BandName, BandActivityCell[]> | null>(null);
  const [bandLastUpdated, setBandLastUpdated] = useState<number | null>(null);
  const [propLastUpdated, setPropLastUpdated] = useState<number | null>(null);
  const qsoCount = qsos?.length || 0
  const operatingHeadline = space
    ? Number(space.kIndex || 0) >= 6
      ? 'Standby for stable local work'
      : Number(space.f107 || 0) > 140
        ? 'HF window looks strong right now'
        : 'A good day for local repeater and hotspot traffic'
    : 'Checking current operating conditions'
  const operatingDeck = space
    ? `Solar conditions, recent contacts, and the current station kit point toward ${Number(space.kIndex || 0) >= 6 ? 'steady VHF/UHF operation' : Number(space.f107 || 0) > 140 ? 'better-than-average 20m and 40m work' : 'mixed local and digital activity'}.`
    : 'Live data is loading from the station dashboard.'
  const stationBulletins = [
    `Recent contact sample: ${qsoCount > 0 ? `${qsoCount} logged entries in the current view` : 'waiting on logbook data'}`,
    `Propagation read: ${space ? `K ${space.kIndex} / F10.7 ${space.f107}` : 'loading current solar data'}`,
    'Primary focus: FM, digital voice, repeaters, hotspot work, and practical station projects.',
  ]
  const stationCards = [
    {
      title: 'Operating Focus',
      text: Number(space?.kIndex || 0) >= 6 ? 'When geomagnetic conditions are rough, the station leans into local repeaters, hotspot work, and reliable VHF/UHF operating instead of chasing marginal HF openings.' : 'Current conditions are good enough to split time between local activity, digital voice, and checking for useful HF windows.',
    },
    {
      title: 'Station Rhythm',
      text: qsoCount > 0 ? 'Recent logbook activity is surfaced here so the home page feels like a live station dashboard instead of a static landing page.' : 'The home page is wired to show recent activity as soon as fresh logbook data is available.',
    },
    {
      title: 'Bench Work',
      text: 'The site stays tied to actual radio work by keeping projects, contact flow, credentials, and propagation surfaces connected to the station itself.',
    },
  ]
  const bandSummaries = summarizeBandActivityGrid(bandGrid)
  const leadingBand = bandSummaries.reduce<BandActivitySummary | null>((best, summary) => {
    if (!summary.bestCell) return best
    if (!best?.bestCell || summary.bestCell.score > best.bestCell.score) return summary
    return best
  }, null)
  const spaceKLabel = space ? (Number.isInteger(space.kIndex) ? String(space.kIndex) : Number(space.kIndex).toFixed(2)) : '—'
  const spaceFluxLabel = space ? String(Math.round(Number(space.f107))) : '—'
  const bandActivityHeadline = leadingBand?.bestCell
    ? `${leadingBand.band} looks best near ${leadingBand.bestSlot}Z`
    : 'Loading live band outlook'
  const bandActivityDeck = leadingBand?.bestCell
    ? `${leadingBand.focus} is leading the board with ${leadingBand.bestCell.label.toLowerCase()} activity around ${leadingBand.bestSlot}Z. ${space?.source === 'noaa' ? `NOAA is live with K ${spaceKLabel} and F10.7 ${spaceFluxLabel}.` : 'Fallback propagation values are active until the live NOAA feed responds again.'}`
    : 'Pulling live propagation data so the band map can settle into its current color pattern.'

  const bandApiLabel = space?.source === 'noaa' ? 'Live NOAA API' : space ? 'Fallback model' : 'Loading source'

  const syncSpaceWeather = (nextSpace: SpaceWeatherSnapshot, updatedAtMs: number) => {
    setSpace(nextSpace)
    setBandGrid(buildBandActivityGrid(nextSpace))
    setBandLastUpdated(updatedAtMs)
    setPropLastUpdated(updatedAtMs)
  }

  useEffect(() => {
    let mounted = true;
    const readCache = (k: string) => {
      try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null }
    };
    const writeCache = (k: string, v: unknown) => {
      try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore quota errors */ }
    };
    let hydrateTimerSpace: ReturnType<typeof setTimeout> | null = null;
    let hydrateTimerLog: ReturnType<typeof setTimeout> | null = null;
    let fetchTimerSpace: ReturnType<typeof setTimeout> | null = null;
    let fetchTimerLog: ReturnType<typeof setTimeout> | null = null;
    let spaceInterval: ReturnType<typeof setInterval> | null = null;

    // hydrate from cache first for faster UI
    try {
      const cachedSpace = readCache('kf8fvd-spaceweather-v1');
      if (cachedSpace && mounted) {
        const normalized = normalizeSpaceWeather(cachedSpace.data || cachedSpace)
        const cachedTs = typeof cachedSpace.ts === 'number' ? cachedSpace.ts : (normalized.updatedAt ? Date.parse(normalized.updatedAt) : Date.now())
        hydrateTimerSpace = setTimeout(() => {
          if (!mounted) return;
          syncSpaceWeather(normalized, Number.isFinite(cachedTs) ? cachedTs : Date.now());
        }, 0);
      }
      const cachedLog = readCache('kf8fvd-logbook-v2');
      if (cachedLog && mounted) {
        const j = cachedLog.data || cachedLog;
        hydrateTimerLog = setTimeout(() => {
          if (!mounted) return;
          const entries = Array.isArray(j.entries) ? j.entries.filter((entry: unknown): entry is QsoEntry => Boolean(entry && typeof entry === 'object' && 'call' in entry)) : [];
          setQsos(entries.slice(0, 6));
        }, 0);
      }
    } catch { /* ignore cache errors */ }

    const loadSpaceWeather = () => {
      fetch('/api/spaceweather', { cache: 'no-store' })
        .then((r) => r.json())
        .then((j) => {
          if (!mounted) return;
          const normalized = normalizeSpaceWeather(j)
          const now = normalized.updatedAt ? (Date.parse(normalized.updatedAt) || Date.now()) : Date.now()
          fetchTimerSpace = setTimeout(() => {
            if (!mounted) return;
            syncSpaceWeather(normalized, now);
            try { writeCache('kf8fvd-spaceweather-v1', { data: normalized, ts: now }); } catch { }
          }, 0);
        })
        .catch(() => {
          if (!mounted) return;
          const fallback = normalizeSpaceWeather({ kIndex: 3, f107: 92, source: 'fallback', updatedAt: new Date().toISOString() })
          fetchTimerSpace = setTimeout(() => {
            if (!mounted) return;
            syncSpaceWeather(fallback, Date.now());
          }, 0);
        });
    }

    loadSpaceWeather()
    spaceInterval = setInterval(loadSpaceWeather, 300_000)

    fetch('/api/logbook')
      .then((r) => r.json())
      .then((j) => {
        if (!mounted) return;
        try { writeCache('kf8fvd-logbook-v2', { data: j, ts: Date.now() }); } catch { }
        fetchTimerLog = setTimeout(() => {
          if (!mounted) return;
          const entries = Array.isArray(j.entries) ? j.entries.filter((entry: unknown): entry is QsoEntry => Boolean(entry && typeof entry === 'object' && 'call' in entry)) : [];
          setQsos(entries.slice(0, 6));
        }, 0);
      })
      .catch(() => { if (mounted) setQsos([]) });

    return () => {
      mounted = false;
      if (hydrateTimerSpace) clearTimeout(hydrateTimerSpace);
      if (hydrateTimerLog) clearTimeout(hydrateTimerLog);
      if (fetchTimerSpace) clearTimeout(fetchTimerSpace);
      if (fetchTimerLog) clearTimeout(fetchTimerLog);
      if (spaceInterval) clearInterval(spaceInterval);
    };
  }, []);

  

  return (
    <section className={styles.dashboard} aria-label="Dashboard">
      <Card className={styles.stationHero} title="Live Station" subtitle="Current operating snapshot">
        <div className={styles.stationHeroGrid}>
          <div className={styles.stationLead}>
            <div className="eyebrow-row">
              <span
                className={[
                  styles.signalDot,
                  onAir === null ? styles.signalDotUnknown : onAir ? styles.signalDotOn : styles.signalDotOff,
                ].join(' ')}
                aria-hidden
              ></span>
              <span className={styles.stationLeadLabel}>Station status</span>
              <span className={styles.stationLeadState}>{onAir === null ? 'Loading' : onAir ? 'On Air' : 'Standby'}</span>
            </div>
            <h3 className={styles.stationHeadline}>{operatingHeadline}</h3>
            <p className={styles.stationDeck}>{operatingDeck}</p>
            <ul className={styles.stationBulletins}>
              {stationBulletins.map((item) => <li key={item}>{item}</li>)}
            </ul>
          </div>
          <div className={styles.stationMetrics}>
            <div className={styles.metricCard}>
              <span className={styles.metricLabel}>On-air state</span>
              <strong className={styles.metricValue}>{onAir === null ? 'Loading' : onAir ? 'On Air' : 'Standby'}</strong>
              <p className="surface-note">Realtime cues are pulled into the dashboard so visitors can tell whether the page reflects an active station.</p>
            </div>
            <div className={styles.metricCard}>
              <span className={styles.metricLabel}>Recent contacts</span>
              <strong className={styles.metricValue}>{qsoCount || '—'}</strong>
              <p className="surface-note">Latest QSOs, logbook data, and station context keep the home page tied to actual operating activity.</p>
            </div>
            <div className={styles.metricCard}>
              <span className={styles.metricLabel}>Primary modes</span>
              <strong className={styles.metricValue}>FM / DMR / D-STAR</strong>
              <p className="surface-note">The site stays focused on practical local radio, digital voice, and project-driven station improvements.</p>
            </div>
          </div>
        </div>
      </Card>

      <div className={styles.topLive}>
        <Card className={`${styles.largeCard}`} title="Live" subtitle="Clock & Status">
          <div className={styles.liveInner}>
            <Clock />
            <OnAirBadge onAir={onAir} />
          </div>
        </Card>
        {/* Featured hero card removed */}
      </div>
      <div className={styles.signalGrid}>
        <Card className={`${styles.smallCard} ${styles.propagationCard}`} title="Propagation" subtitle="Solar / K-index">
          <div className={styles.prop}>
            <div className={styles.propValues}>
              <div className={styles.propItem}>
                <div className={styles.propLabel}>K-index</div>
                <div className={`${styles.propValue} ${styles.propValueWarn}`}>{space ? space.kIndex : '—'}</div>
              </div>
              <div className={styles.propItem}>
                <div className={styles.propLabel}>F10.7</div>
                <div className={`${styles.propValue} ${styles.propValueLink}`}>{space ? space.f107 : '—'}</div>
              </div>
            </div>
            <div className={styles.propRecommend}>
              {space ? (() => {
                const k = Number(space.kIndex || 0);
                const f = Number(space.f107 || 0);
                if (k >= 6) return 'Conditions unsettled — VHF/UHF preferred';
                if (f > 150 && k <= 3) return 'HF propagation good — 20m / 40m recommended';
                if (f > 100 && k <= 4) return 'HF decent — 20m recommended';
                return 'Local VHF repeaters likely best';
              })() : 'loading…'}
            </div>
            <div className={styles.propNote}>{space ? `Source: ${space.source} • Updated: ${propLastUpdated ? new Date(propLastUpdated).toLocaleString() : '—'}` : 'loading…'}</div>
          </div>
        </Card>

        <Card className={`${styles.smallCard} ${styles.highlightCard} ${styles.qsoCard}`} title="Recent QSOs" subtitle="Latest contacts">
          <ul className={`${styles.qsoList} accent-scroll`}>
            {qsos === null && <li className={styles.qsoItem}>loading…</li>}
            {qsos && qsos.length === 0 && <li className={styles.qsoItem}>No recent logbook entries are available</li>}
            {qsos && qsos.map((q, i) => (
              <li key={i} className={styles.qsoItem}>
                {(() => {
                  const raw = q.display || `${q.date} — ${q.call}`;
                  const cleaned = raw.replace(/^\d{6,8}(?:\s*\d{3,4})?\s*—\s*/, '');
                  return <span className={styles.qsoText}>{cleaned}</span>;
                })()}
                {(q.city || q.state || q.qth) && (
                  <span className={styles.qsoLocation}>{q.city || q.qth}{q.state ? `, ${q.state}` : ''}{q.country ? ` • ${q.country}` : ''}</span>
                )}
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <div className={styles.featureGrid}>
        <Card className={styles.stationNotesCard} title="Station Notes" subtitle="What this site is centered on">
          <div className={styles.stationCardGrid}>
            {stationCards.map((card) => (
              <div key={card.title} className={styles.stationInfoCard}>
                <h4 className={styles.stationInfoTitle}>{card.title}</h4>
                <p className={styles.stationInfoText}>{card.text}</p>
              </div>
            ))}
          </div>
        </Card>

        <Card className={styles.bandActivityCard} title="Band Activity" subtitle="Live color map from current propagation">
          <div className={styles.heatOverview}>
            <div className={styles.heatOverviewCopy}>
              <span className={styles.heatEyebrow}>Live Outlook</span>
              <h4 className={styles.heatHeadline}>{bandActivityHeadline}</h4>
              <p className={styles.heatDeck}>{bandActivityDeck}</p>
            </div>
            <div className={styles.heatStats}>
              <div className={styles.heatStatCard}>
                <span className={styles.heatStatLabel}>Best band</span>
                <strong className={styles.heatStatValue}>{leadingBand?.band || '—'}</strong>
              </div>
              <div className={styles.heatStatCard}>
                <span className={styles.heatStatLabel}>Best window</span>
                <strong className={styles.heatStatValue}>{leadingBand?.bestCell ? `${leadingBand.bestSlot}Z` : '—'}</strong>
              </div>
              <div className={styles.heatStatCard}>
                <span className={styles.heatStatLabel}>Solar read</span>
                <strong className={styles.heatStatValue}>{space ? `K ${spaceKLabel} / F ${spaceFluxLabel}` : 'Loading'}</strong>
              </div>
            </div>
          </div>
          <div className={styles.heatmapShell}>
            <div className={styles.heatmap}>
              <div className={styles.heatHeader}>
                <div className={styles.heatAxisLabel}>Band</div>
                {BAND_TIME_SLOTS.map((slot) => <div key={slot} className={styles.heatHeaderCell}>{slot}Z</div>)}
              </div>
              {BAND_ORDER.map((band) => (
                <div key={band} className={styles.heatRow}>
                  <div className={styles.bandLabelBlock}>
                    <span className={styles.bandLabel}>{band}</span>
                    <span className={styles.bandLabelMeta}>{BAND_ACTIVITY_NOTES[band].focus}</span>
                  </div>
                  {BAND_TIME_SLOTS.map((slot, index) => {
                    const cell = bandGrid?.[band]?.[index] ?? null
                    const className = [styles.heatCell, getBandActivityClass(cell?.level ?? null)].join(' ')
                    const title = cell
                      ? `${band} at ${slot}Z: ${cell.label} activity (${Math.round(cell.score * 100)} / 100)`
                      : `${band} at ${slot}Z: loading activity`
                    return (
                      <div key={slot} className={className} title={title} aria-label={title}>
                        <span className={styles.heatCellValue}>{cell?.label || '—'}</span>
                        <span className={styles.heatCellScore}>{cell ? `${Math.round(cell.score * 100)}` : ' '}</span>
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
            <div className={styles.heatLegend}>
              {[
                { label: 'Low', level: 'low' as const },
                { label: 'Fair', level: 'fair' as const },
                { label: 'Good', level: 'good' as const },
                { label: 'Strong', level: 'strong' as const },
                { label: 'Peak', level: 'peak' as const },
              ].map((it) => (
                <div key={it.label} className={styles.legendItem}>
                  <span className={[styles.legendSwatch, getLegendSwatchClass(it.level)].join(' ')} aria-hidden />
                  <span className={styles.legendLabel}>{it.label}</span>
                </div>
              ))}
            </div>
            <div className={styles.heatMeta}>
              <span className={[styles.sourceBadge, space?.source === 'noaa' ? styles.sourceBadgeLive : styles.sourceBadgeFallback].join(' ')}>{bandApiLabel}</span>
              <span className={styles.cardSource}>{bandGrid && space ? `Updated: ${bandLastUpdated ? new Date(bandLastUpdated).toLocaleString() : '—'}` : 'Loading live propagation data'}</span>
            </div>
          </div>
          <div className={styles.heatBandStrip}>
            {bandSummaries.map((summary) => (
              <div key={summary.band} className={styles.heatBandCard}>
                <div className={styles.heatBandCardTop}>
                  <div>
                    <div className={styles.heatBandCardLabel}>{summary.band}</div>
                    <div className={styles.heatBandCardFocus}>{summary.focus}</div>
                  </div>
                  <span className={[styles.heatBandCardBadge, getActivityToneClass(summary.bestCell?.level ?? summary.averageLevel)].join(' ')}>
                    {summary.bestCell?.label || 'Loading'}
                  </span>
                </div>
                <p className={styles.heatBandCardText}>{summary.detail}</p>
                <div className={styles.heatBandCardFooter}>Best around {summary.bestSlot}Z</div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className={styles.utilityGrid}>
        <Card className={styles.utilityCard} title="Nets & Contests" subtitle="Schedule">
          <ul className={styles.eventList}>
            <li>No current net or contest schedule is published.</li>
          </ul>
        </Card>

        <Card className={styles.utilityCard} title="Equipment" subtitle="Quick snapshot">
          <div className={styles.equipGrid}>
            <div className={styles.equipCard}>Icom ID-52A PLUS</div>
            <div className={styles.equipCard}>Baofeng DM-32UV</div>
            <div className={styles.equipCard}>Raspberry Pi 4 — MMDVM</div>
          </div>
        </Card>
      </div>
    </section>
  );
}
