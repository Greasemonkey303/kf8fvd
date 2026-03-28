"use client"

import React, { useEffect, useState, useRef } from 'react';
import styles from './dashboard.module.css';
import { Card } from '@/components';

function getCssVar(name: string, fallback: string) {
  if (typeof window === 'undefined') return fallback
  const v = getComputedStyle(document.documentElement).getPropertyValue(name)
  return v ? v.trim() : fallback
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

  return (
    <div className={styles.clock} aria-hidden>
      <div className={styles.callsign}>KF8FVD</div>
      <div className={styles.time}>{now ? now.toLocaleTimeString() : '—:—:—'}</div>
      <div className={styles.utc}>{now ? `UTC ${now.toISOString().slice(11,19)}` : ''}</div>
      <div className={styles.tz}>{now ? now.toLocaleDateString() : ''}</div>
      <div className={styles.citiesGrid} aria-hidden>
        {displayed.map((c) => {
          const varName = `--city-${c.tz.replace(/\//g,'_')}`
          const cityColor = getCssVar(varName, getCssVar('--color-other', '#94a3b8'))
          return (
            <div key={c.tz} className={styles.cityItem} ref={(el) => { if (el) el.style.setProperty('--city-color', cityColor); }}>
                <div className={styles.cityHeader}>
                  <div className={styles.cityName}>{c.flag} {c.name}</div>
                <div className={styles.cityTz}>{now ? new Intl.DateTimeFormat(undefined, { timeZoneName: 'short', timeZone: c.tz }).format(now).split(' ').pop() : ''}</div>
              </div>
              <div className={styles.cityTime}>{now ? new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: c.tz }).format(now) : '—:—'}</div>
            </div>
          )
        })}
      </div>
    </div>
  );
}

function OnAirBadge() {
  // Read on-air state from the server; fallback to a local time heuristic
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
      } catch (e) {
        // fallback to heuristic when API unavailable
        fallbackCheck()
      }
    }

    fetchState()
    const id = setInterval(fetchState, 30_000)
    return () => { mounted = false; clearInterval(id) }
  }, [])
  const badgeRef = useRef<HTMLDivElement | null>(null);

  // Position the badge so its top aligns with the top of the `.time`
  useEffect(() => {
    const updatePos = () => {
      const el = badgeRef.current;
      if (!el) return;
      const parent = el.offsetParent as HTMLElement | null;
      if (!parent) return;
      const timeEl = parent.querySelector(`.${styles.time}`) as HTMLElement | null;
      if (!timeEl) return;
      // place badge top at the same offset as the top of the time element
      const top = timeEl.offsetTop;
      el.style.top = `${top}px`;
      el.style.left = '50%';
      el.style.transform = 'translateX(-50%)';
    };
    updatePos();
    window.addEventListener('resize', updatePos);
    const ro = new MutationObserver(updatePos);
    ro.observe(document.body, { childList: true, subtree: true });
    return () => {
      window.removeEventListener('resize', updatePos);
      ro.disconnect();
    };
  }, []);

  const stateClass = onAir === null ? '' : (onAir ? styles.onAirActive : styles.off)
  const cls = `${styles.badge} ${stateClass} ${styles.onAirBadge}`.trim()
  return (
    <div ref={badgeRef} className={cls}>
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

type HeroImage = {
  is_featured?: number | boolean;
  url?: string;
}

export default function Dashboard() {
  const [featured, setFeatured] = useState<{ url?: string; title?: string } | null>(null)
  const [space, setSpace] = useState<{kIndex:number; f107:number; source:string} | null>(null);
  const [qsos, setQsos] = useState<Array<string | QsoEntry> | null>(null);
  const [bandGrid, setBandGrid] = useState<Record<string, number[]> | null>(null);
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

  // deterministic pseudo-random opacity so server/client render match
  function getOpacity(band: string, col: number) {
    let seed = 0;
    for (let i = 0; i < band.length; i++) seed = (seed * 31 + band.charCodeAt(i)) >>> 0;
    seed = (seed + col * 997) >>> 0;
    const v = Math.abs(Math.sin(seed * 0.0001));
    return v * 0.7 + 0.15;
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
    let fetchTimerFeatured: ReturnType<typeof setTimeout> | null = null;

    // hydrate from cache first for faster UI
    try {
      const cachedSpace = readCache('kf8fvd-spaceweather-v1');
      if (cachedSpace && mounted) {
        hydrateTimerSpace = setTimeout(() => {
          if (!mounted) return;
          setSpace(cachedSpace.data || cachedSpace);
          setBandLastUpdated(cachedSpace.ts || Date.now());
          setPropLastUpdated(cachedSpace.ts || Date.now());
        }, 0);
      }
      const cachedLog = readCache('kf8fvd-logbook-v1');
      if (cachedLog && mounted) {
        const j = cachedLog.data || cachedLog;
        hydrateTimerLog = setTimeout(() => {
          if (!mounted) return;
          if (j.source === 'qrz' && j.raw) {
            const rawMatches = Array.from((j.raw || '').matchAll(/<call>([^<]+)<\/call>/gi)) as RegExpMatchArray[];
            const matches = rawMatches.slice(0,5).map((m) => m[1]);
            setQsos(matches.length ? matches : []);
          } else if (j.entries && Array.isArray(j.entries)) {
            setQsos(j.entries.slice(0,6));
          } else {
            setQsos([]);
          }
        }, 0);
      }
    } catch { /* ignore cache errors */ }

    fetch('/api/spaceweather')
      .then((r) => r.json())
      .then((j) => {
        if (mounted) {
          const now = Date.now();
          fetchTimerSpace = setTimeout(() => {
            if (!mounted) return;
            setSpace(j);
            setBandLastUpdated(now);
            setPropLastUpdated(now);
            try { writeCache('kf8fvd-spaceweather-v1', { data: j, ts: now }); } catch { }
            // derive band activity grid from space weather
            try {
              const bands = ['2m','70cm','20m','40m'];
              const f = typeof j.f107 === 'number' ? j.f107 : (parseFloat(String(j.f107)) || 92);
              const k = typeof j.kIndex === 'number' ? j.kIndex : (parseFloat(String(j.kIndex)) || 3);
              const fNorm = Math.max(0, Math.min(1, (f - 60) / 140));
              const kMod = Math.max(0.3, 1 - (k / 9));
              const grid: Record<string, number[]> = {};
              bands.forEach((band) => {
                const base = band === '2m' ? 0.65 : band === '70cm' ? 0.5 : band === '20m' ? 0.55 : 0.45;
                grid[band] = Array.from({ length: 4 }).map((_, i) => {
                  const seasonal = getOpacity(band, i); // deterministic variation
                  const v = base * (0.35 + 0.65 * fNorm) * kMod * seasonal;
                  return Math.max(0.15, Math.min(0.95, v));
                });
              });
              setBandGrid(grid);
            } catch { setBandGrid(null); }
          }, 0);
        }
      })
      .catch(() => { if (mounted) setSpace({kIndex:3,f107:92,source:'fallback'}) });

    fetch('/api/logbook')
      .then((r) => r.json())
      .then((j) => {
        if (!mounted) return;
        try { writeCache('kf8fvd-logbook-v1', { data: j, ts: Date.now() }); } catch { }
        fetchTimerLog = setTimeout(() => {
          if (!mounted) return;
          if (j.source === 'qrz' && j.raw) {
            // naive extract of some call signs from XML for display
            const rawMatches = Array.from((j.raw || '').matchAll(/<call>([^<]+)<\/call>/gi)) as RegExpMatchArray[];
            const matches = rawMatches.slice(0,5).map((m) => m[1]);
            setQsos(matches.length ? matches : []);
          } else if (j.entries && Array.isArray(j.entries)) {
            setQsos(j.entries.slice(0,6));
          } else {
            setQsos([]);
          }
        }, 0);
      })
      .catch(() => { if (mounted) setQsos([]) });

    // fetch featured hero for dashboard
    fetch('/api/hero')
      .then(r => r.json())
      .then(j => {
        if (!mounted) return
        fetchTimerFeatured = setTimeout(() => {
          if (!mounted) return
          const h = j?.hero || null
          const imgs = Array.isArray(j?.images) ? (j.images as HeroImage[]) : []
          const f = imgs.find((item) => Number(item.is_featured) === 1) || imgs[0] || null
          if (f) setFeatured({ url: f.url, title: h?.title || '' })
          else setFeatured(null)
        }, 0)
      })
      .catch(()=>{})

    return () => {
      mounted = false;
      if (hydrateTimerSpace) clearTimeout(hydrateTimerSpace);
      if (hydrateTimerLog) clearTimeout(hydrateTimerLog);
      if (fetchTimerSpace) clearTimeout(fetchTimerSpace);
      if (fetchTimerLog) clearTimeout(fetchTimerLog);
      if (fetchTimerFeatured) clearTimeout(fetchTimerFeatured);
    };
  }, []);

  

  return (
    <section className={styles.dashboard} aria-label="Dashboard">
      <Card className={styles.stationHero} title="Live Station" subtitle="Current operating snapshot">
        <div className={styles.stationHeroGrid}>
          <div className={styles.stationLead}>
            <div className="eyebrow-row">
              <span className="signal-dot" aria-hidden></span>
              <span className={styles.stationLeadLabel}>Station status</span>
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
              <strong className={styles.metricValue}>Live</strong>
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
            <OnAirBadge />
          </div>
        </Card>
        {/* Featured hero card removed */}
      </div>
      <div className={`${styles.row} ${styles.rowShiftLeft}`}>
        <Card className={styles.smallCard} title="Propagation" subtitle="Solar / K-index">
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
                // simple recommendations
                if (k >= 6) return 'Conditions unsettled — VHF/UHF preferred';
                if (f > 150 && k <= 3) return 'HF propagation good — 20m / 40m recommended';
                if (f > 100 && k <= 4) return 'HF decent — 20m recommended';
                return 'Local VHF repeaters likely best';
              })() : 'loading…'}
            </div>
            <div className={styles.propNote}>{space ? `Source: ${space.source} • Updated: ${propLastUpdated ? new Date(propLastUpdated).toLocaleString() : '—'}` : 'loading…'}</div>
          </div>
        </Card>

          <Card className={`${styles.smallCard} ${styles.highlightCard}`} title="Recent QSOs" subtitle="Latest contacts">
          <ul className={`${styles.qsoList} accent-scroll`}>
            {qsos === null && <li className={styles.qsoItem}>loading…</li>}
            {qsos && qsos.length === 0 && <li className={styles.qsoItem}>No recent QSOs found</li>}
            {qsos && qsos.map((q, i) => (
              <li key={i} className={styles.qsoItem}>
                {(() => {
                  const raw = typeof q === 'string' ? q : (q.display || `${q.date} — ${q.call}`);
                  const cleaned = raw.replace(/^\d{6,8}(?:\s*\d{3,4})?\s*—\s*/,'');
                  return <span className={styles.qsoText}>{cleaned}</span>;
                })()}
                {typeof q !== 'string' && (q.city || q.state || q.qth) && (
                  <span className={styles.qsoLocation}>{q.city || q.qth}{q.state ? `, ${q.state}` : ''}{q.country ? ` • ${q.country}` : ''}</span>
                )}
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <div className={styles.row}>
        <Card title="Station Notes" subtitle="What this site is centered on">
          <div className={styles.stationCardGrid}>
            {stationCards.map((card) => (
              <div key={card.title} className={styles.stationInfoCard}>
                <h4 className={styles.stationInfoTitle}>{card.title}</h4>
                <p className={styles.stationInfoText}>{card.text}</p>
              </div>
            ))}
          </div>
        </Card>

        <Card title="Band Activity" subtitle="Heatmap overview">
          <div className={styles.heatmap}>
            {/* simple mocked heatmap: rows bands, columns times */}
            <div className={styles.heatHeader}><div />{['00','06','12','18'].map(t=> <div key={t}>{t}Z</div>)}</div>
            {['2m','70cm','20m','40m'].map((band)=> (
              <div key={band} className={styles.heatRow}>
                <div className={styles.bandLabel}>{band}</div>
                {Array.from({length:4}).map((_,i)=> (
                  <div key={i} className={styles.heatCell} ref={(el) => { if (el) el.style.setProperty('--cell-opacity', String(getOpacity(band, i))); }} />
                ))}
              </div>
            ))}
          </div>
          <div className={styles.heatLegend} aria-hidden>
            {[
              {label: 'Low', o: 0.2},
              {label: 'Moderate', o: 0.45},
              {label: 'High', o: 0.7},
              {label: 'Very High', o: 0.9},
            ].map((it) => (
              <div key={it.label} className={styles.legendItem}>
                <span className={styles.legendSwatch} ref={(el) => { if (el) el.style.setProperty('--legend-opacity', String(it.o)); }} />
                <span className={styles.legendLabel}>{it.label}</span>
              </div>
            ))}
          </div>
          <div className={styles.cardSource}>{bandGrid && space ? `Source: ${space.source} • Last updated: ${bandLastUpdated ? new Date(bandLastUpdated).toLocaleString() : '—'}` : 'Source: simulated heatmap (not live)'}</div>
        </Card>

        <Card title="Nets & Contests" subtitle="Upcoming">
          <ul className={styles.eventList}>
            <li><strong>Monday 20:00</strong> — Local VHF Net (W8IRA)</li>
            <li><strong>Sat 14:00</strong> — Club Contest Practice</li>
            <li><strong>Mar 3</strong> — Statewide Net (MI)</li>
          </ul>
        </Card>

        <Card title="Equipment" subtitle="Quick snapshot">
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
