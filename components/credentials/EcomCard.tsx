"use client"

import React, { useState } from 'react'
import { ImageModal } from '@/components'
import styles from '../../app/credentials/credentials.module.css'

function getCssVar(name: string, fallback: string) {
  if (typeof window === 'undefined') return fallback
  const v = getComputedStyle(document.documentElement).getPropertyValue(name)
  return v ? v.trim() : fallback
}

export default function EcomCard(){
  const [open, setOpen] = useState<string | null>(null)
  // build SVG placeholder using theme tokens at runtime
  const bg = getCssVar('--color-bg', '#0f172a')
  const title = getCssVar('--color-accent-1', '#60a5fa')
  const svg = encodeURIComponent(`
    <svg xmlns='http://www.w3.org/2000/svg' width='1200' height='800'>
      <rect width='100%' height='100%' fill='${bg}'/>
      <text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle' fill='${title}' font-family='Arial' font-size='48'>Emergency Communications</text>
    </svg>
  `)
  const src = `data:image/svg+xml;utf8,${svg}`

  return (
    <div className={styles.stationCard}>
      <div className={styles.headerRow}>
        <h4 className={styles.stationTitle}>Emergency Communications</h4>
        <span className={styles.badge}>Lab</span>
      </div>

      <p className={styles.lead}>Ham radio prep resources and exercises for emergency communications.</p>

        <div className={styles.mediaRow}>
          <button className={styles.thumbWrap} onClick={() => setOpen(src)} aria-label="Open Emergency Communications preview">
          <img src={src} alt="Emergency Communications preview" className={styles.licenseThumb} />
          <div className={styles.overlay} aria-hidden>
            <span className={styles.overlayTitle}>Emergency Communications</span>
          </div>
        </button>

        <div className={styles.meta}>
          <dl>
            <dt>Type</dt>
            <dd>Training Lab</dd>
          </dl>
          <button className={styles.viewBtn} onClick={() => setOpen(src)}>Open Lab</button>
        </div>
      </div>

      {open && <ImageModal src={open} alt="Ecom preview" onClose={() => setOpen(null)} />}
    </div>
  )
}
