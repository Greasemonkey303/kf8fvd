"use client"

import React, { useEffect, useState } from 'react';
import styles from './dashboard.module.css';
import { Card } from '@/components';

function Clock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <div className={styles.clock} aria-hidden>
      <div className={styles.callsign}>KF8FVD</div>
      <div className={styles.time}>{now ? now.toLocaleTimeString() : '—:—:—'}</div>
      <div className={styles.tz}>{now ? now.toLocaleDateString() : ''}</div>
    </div>
  );
}

function OnAirBadge() {
  // simple heuristic: on-air during UTC 18-20
  const [onAir, setOnAir] = useState<boolean | null>(null);
  useEffect(() => {
    const check = () => {
      const h = new Date().getUTCHours();
      setOnAir(h >= 18 && h <= 20);
    };
    check();
    const id = setInterval(check, 60_000);
    return () => clearInterval(id);
  }, []);
  const cls = onAir === null ? styles.badge : `${styles.badge} ${onAir ? styles.on : styles.off}`;
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
  const [space, setSpace] = useState<{kIndex:number; f107:number; source:string} | null>(null);
  const [qsos, setQsos] = useState<Array<string | QsoEntry> | null>(null);
  const [bandGrid, setBandGrid] = useState<Record<string, number[]> | null>(null);
  const [bandLastUpdated, setBandLastUpdated] = useState<number | null>(null);
  const [propLastUpdated, setPropLastUpdated] = useState<number | null>(null);

  useEffect(() => {
    let mounted = true;
    fetch('/api/spaceweather')
      .then((r) => r.json())
      .then((j) => {
        if (mounted) {
          setSpace(j);
          const now = Date.now();
          setBandLastUpdated(now);
          setPropLastUpdated(now);
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
          } catch (e) {
            setBandGrid(null);
          }
        }
      })
      .catch(() => { if (mounted) setSpace({kIndex:3,f107:92,source:'fallback'}) });

    fetch('/api/logbook')
      .then((r) => r.json())
      .then((j) => {
        if (!mounted) return;
        if (j.source === 'qrz' && j.raw) {
          // naive extract of some call signs from XML for display
          const rawMatches = Array.from(j.raw.matchAll(/<call>([^<]+)<\/call>/gi)) as RegExpMatchArray[];
          const matches = rawMatches.slice(0,5).map((m) => m[1]);
          setQsos(matches.length ? matches : []);
        } else if (j.entries && Array.isArray(j.entries)) {
          setQsos(j.entries.slice(0,6));
        } else {
          setQsos([]);
        }
      })
      .catch(() => { if (mounted) setQsos([]) });

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
      <div className={styles.row}>
        <Card className={styles.smallCard} title="Live" subtitle="Clock & Status">
          <div className={styles.liveInner}>
            <Clock />
            <OnAirBadge />
          </div>
        </Card>

        <Card className={styles.smallCard} title="Propagation" subtitle="Solar / K-index">
          <div className={styles.prop}>
            <div className={styles.propValues}>
              <div className={styles.propItem}>
                <div className={styles.propLabel}>K-index</div>
                <div className={styles.propValue} style={{color:'#ffb020'}}>{space ? space.kIndex : '—'}</div>
              </div>
              <div className={styles.propItem}>
                <div className={styles.propLabel}>F10.7</div>
                <div className={styles.propValue} style={{color:'#7dd3fc'}}>{space ? space.f107 : '—'}</div>
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
          <ul className={styles.qsoList}>
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
                  <div key={i} className={styles.heatCell} style={{opacity: getOpacity(band, i)}} />
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
                <span className={styles.legendSwatch} style={{opacity: it.o}} />
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
