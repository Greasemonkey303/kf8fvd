"use client"

import React, { useState } from 'react'
import ImageModal from '@/components/modal/ImageModal'
import styles from '../../app/credentials/credentials.module.css'

export default function EcomCard(){
  const [open, setOpen] = useState<string | null>(null)
  // inline SVG placeholder for Emergency Communications
  const svg = encodeURIComponent(`
    <svg xmlns='http://www.w3.org/2000/svg' width='1200' height='800'>
      <rect width='100%' height='100%' fill='#0f172a'/>
      <text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle' fill='#60a5fa' font-family='Arial' font-size='48'>Emergency Communications</text>
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
          <button className={styles.thumbWrap} onClick={() => setOpen(src)} style={{ padding:0, border:'none', background:'transparent' }} aria-label="Open Emergency Communications preview">
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

      <ImageModal src={open} alt="Ecom preview" onClose={() => setOpen(null)} />
    </div>
  )
}
