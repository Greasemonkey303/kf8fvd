"use client"

import React, { useState } from 'react'
import ImageModal from '@/components/modal/ImageModal'
import styles from '../../app/credentials/credentials.module.css'

export default function SatelliteCard(){
  const [open, setOpen] = useState<string | null>(null)
  const svg = encodeURIComponent(`
    <svg xmlns='http://www.w3.org/2000/svg' width='1200' height='800'>
      <rect width='100%' height='100%' fill='#0f172a'/>
      <text x='50%' y='45%' dominant-baseline='middle' text-anchor='middle' fill='#60a5fa' font-family='Arial' font-size='56'>Satellite & Space</text>
      <text x='50%' y='62%' dominant-baseline='middle' text-anchor='middle' fill='#c7f9cc' font-family='Arial' font-size='28'>Tropospheric, satellite, and space comms</text>
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
        <button className={styles.thumbWrap} onClick={() => setOpen(src)} style={{ padding:0, border:'none', background:'transparent' }} aria-label="Open Satellite & Space preview">
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

      <ImageModal src={open} alt="Satellite & Space preview" onClose={() => setOpen(null)} />
    </div>
  )
}
