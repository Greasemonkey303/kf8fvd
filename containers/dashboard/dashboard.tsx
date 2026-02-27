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

export default function Dashboard() {
  const [space, setSpace] = useState<{kIndex:number; f107:number; source:string} | null>(null);
  const [qsos, setQsos] = useState<string[] | null>(null);

  useEffect(() => {
    let mounted = true;
    fetch('/api/spaceweather')
      .then((r) => r.json())
      .then((j) => { if (mounted) setSpace(j); })
      .catch(() => { if (mounted) setSpace({kIndex:3,f107:92,source:'fallback'}) });

    fetch('/api/logbook')
      .then((r) => r.json())
      .then((j) => {
        if (!mounted) return;
        if (j.source === 'qrz' && j.raw) {
          // naive extract of some call signs from XML for display
          const matches = Array.from(j.raw.matchAll(/<call>([^<]+)<\/call>/gi)).slice(0,5).map(m=>m[1]);
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
            <div className={styles.propItem}>
              <div className={styles.propLabel}>K-index</div>
              <div className={styles.propValue} style={{color:'#ffb020'}}>{space ? space.kIndex : '—'}</div>
            </div>
            <div className={styles.propItem}>
              <div className={styles.propLabel}>F10.7</div>
              <div className={styles.propValue} style={{color:'#7dd3fc'}}>{space ? space.f107 : '—'}</div>
            </div>
            <div className={styles.propNote}>{space ? `source: ${space.source}` : 'loading…'}</div>
          </div>
        </Card>

        <Card className={`${styles.smallCard} ${styles.highlightCard}`} title="Recent QSOs" subtitle="Latest contacts">
          <ul className={styles.qsoList}>
            {qsos === null && <li className={styles.qsoItem}>loading…</li>}
            {qsos && qsos.length === 0 && <li className={styles.qsoItem}>No recent QSOs found</li>}
            {qsos && qsos.map((q, i) => (
              <li key={i} className={styles.qsoItem}>
                <span className={styles.qsoText}>{q}</span>
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
