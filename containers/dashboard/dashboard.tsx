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
    setNow(new Date());
    setWidth(window.innerWidth);
    const id = setInterval(() => setNow(new Date()), 1000);
    const onResize = () => setWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => { clearInterval(id); window.removeEventListener('resize', onResize); };
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

export default function Dashboard() {
  const [featured, setFeatured] = useState<{ url?: string; title?: string } | null>(null)
  const [space, setSpace] = useState<{kIndex:number; f107:number; source:string} | null>(null);
  const [qsos, setQsos] = useState<Array<string | QsoEntry> | null>(null);
  const [bandGrid, setBandGrid] = useState<Record<string, number[]> | null>(null);
  const [bandLastUpdated, setBandLastUpdated] = useState<number | null>(null);
  const [propLastUpdated, setPropLastUpdated] = useState<number | null>(null);

  useEffect(() => {
    let mounted = true;
    const readCache = (k: string) => {
      try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null }
    };
    const writeCache = (k: string, v: unknown) => {
      try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore quota errors */ }
    };

    // hydrate from cache first for faster UI
    try {
      const cachedSpace = readCache('kf8fvd-spaceweather-v1');
      if (cachedSpace && mounted) {
        setSpace(cachedSpace.data || cachedSpace);
        setBandLastUpdated(cachedSpace.ts || Date.now());
        setPropLastUpdated(cachedSpace.ts || Date.now());
      }
      const cachedLog = readCache('kf8fvd-logbook-v1');
      if (cachedLog && mounted) {
        const j = cachedLog.data || cachedLog;
        if (j.source === 'qrz' && j.raw) {
          const rawMatches = Array.from((j.raw || '').matchAll(/<call>([^<]+)<\/call>/gi)) as RegExpMatchArray[];
          const matches = rawMatches.slice(0,5).map((m) => m[1]);
          setQsos(matches.length ? matches : []);
        } else if (j.entries && Array.isArray(j.entries)) {
          setQsos(j.entries.slice(0,6));
        } else {
          setQsos([]);
        }
      }
    } catch { /* ignore cache errors */ }

    fetch('/api/spaceweather')
      .then((r) => r.json())
      .then((j) => {
        if (mounted) {
          setSpace(j);
          const now = Date.now();
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
        }
      })
      .catch(() => { if (mounted) setSpace({kIndex:3,f107:92,source:'fallback'}) });

    fetch('/api/logbook')
      .then((r) => r.json())
      .then((j) => {
        if (!mounted) return;
        try { writeCache('kf8fvd-logbook-v1', { data: j, ts: Date.now() }); } catch { }
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
      })
      .catch(() => { if (mounted) setQsos([]) });

    // fetch featured hero for dashboard
    fetch('/api/hero')
      .then(r => r.json())
      .then(j => {
        if (!mounted) return
        const h = j?.hero || null
        const imgs = Array.isArray(j?.images) ? j.images : []
        const f = imgs.find((i:any) => Number(i.is_featured) === 1) || imgs[0] || null
        if (f) setFeatured({ url: f.url, title: h?.title || '' })
        else setFeatured(null)
      })
      .catch(()=>{})

    return () => { mounted = false };
  }, []);

  // deterministic pseudo-random opacity so server/client render match
  const getOpacity = (band: string, col: number) => {
    let seed = 0;
    for (let i = 0; i < band.length; i++) seed = (seed * 31 + band.charCodeAt(i)) >>> 0;
    seed = (seed + col * 997) >>> 0;
    // use sine to expand to [0,1]
    const v = Math.abs(Math.sin(seed * 0.0001));
    return v * 0.7 + 0.15;
  };

  return (
    <section className={styles.dashboard} aria-label="Dashboard">
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
