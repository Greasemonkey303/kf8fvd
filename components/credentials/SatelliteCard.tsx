"use client"

import React, { useState } from 'react'
import { ImageModal } from '@/components'
import styles from '../../app/credentials/credentials.module.css'

function getCssVar(name: string, fallback: string) {
  if (typeof window === 'undefined') return fallback
  const v = getComputedStyle(document.documentElement).getPropertyValue(name)
  return v ? v.trim() : fallback
}

export default function SatelliteCard(){
  const [open, setOpen] = useState<string | null>(null)
  const bg = getCssVar('--color-bg', '#0f172a')
  const title = getCssVar('--color-accent-1', '#60a5fa')
  const subtitle = getCssVar('--white-90', '#c7f9cc')
  const svg = encodeURIComponent(`
    <svg xmlns='http://www.w3.org/2000/svg' width='1200' height='800'>
      <rect width='100%' height='100%' fill='${bg}'/>
      <text x='50%' y='45%' dominant-baseline='middle' text-anchor='middle' fill='${title}' font-family='Arial' font-size='56'>Satellite & Space</text>
      <text x='50%' y='62%' dominant-baseline='middle' text-anchor='middle' fill='${subtitle}' font-family='Arial' font-size='28'>Tropospheric, satellite, and space comms</text>
    </svg>
  `)
  const src = `data:image/svg+xml;utf8,${svg}`

  return (
    <div className={styles.stationCard}>
      <div className={styles.headerRow}>
        <h4 className={styles.stationTitle}>Satellite & Space</h4>
        <span className={styles.badge}>Course</span>
      </div>

      <p className={styles.lead}>Operating procedures for satellites, cubesats, and space communications.</p>

      <div className={styles.mediaRow}>
        <button className={styles.thumbWrap} onClick={() => setOpen(src)} aria-label="Open Satellite & Space preview">
          <img src={src} alt="Satellite & Space preview" className={styles.licenseThumb} />
          <div className={styles.overlay} aria-hidden>
            <span className={styles.overlayTitle}>Satellite & Space</span>
          </div>
        </button>

            <div className={styles.meta}>
          <dl>
            <dt>Topic</dt>
            <dd>Satellites</dd>
          </dl>
          <button className={styles.viewBtn} onClick={() => setOpen(src)}>Open</button>
        </div>
      </div>

      {open && <ImageModal src={open} alt="Satellite & Space preview" onClose={() => setOpen(null)} />}
    </div>
  )
}
