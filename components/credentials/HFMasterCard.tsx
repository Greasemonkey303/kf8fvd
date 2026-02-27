"use client"

import React, { useState } from 'react'
import ImageModal from '@/components/modal/ImageModal'
import styles from '../../app/credentials/credentials.module.css'

export default function HFMasterCard(){
  const [open, setOpen] = useState<string | null>(null)
  const svg = encodeURIComponent(`
    <svg xmlns='http://www.w3.org/2000/svg' width='1200' height='800'>
      <rect width='100%' height='100%' fill='#021124'/>
      <text x='50%' y='45%' dominant-baseline='middle' text-anchor='middle' fill='#f97316' font-family='Arial' font-size='56'>HF Master Class</text>
      <text x='50%' y='60%' dominant-baseline='middle' text-anchor='middle' fill='#93c5fd' font-family='Arial' font-size='32'>Advanced HF operation and propagation</text>
    </svg>
  `)
  const src = `data:image/svg+xml;utf8,${svg}`

  return (
    <div className={styles.stationCard}>
      <div className={styles.headerRow}>
        <h4 className={styles.stationTitle}>HF Master Class</h4>
        <span className={styles.badge}>Course</span>
      </div>

      <p className={styles.lead}>Advanced HF techniques, propagation, and operating practices.</p>

      <div className={styles.mediaRow}>
        <button className={styles.thumbWrap} onClick={() => setOpen(src)} style={{ padding:0, border:'none', background:'transparent' }} aria-label="Open HF Master Class preview">
          <img src={src} alt="HF Master Class preview" className={styles.licenseThumb} />
          <div className={styles.overlay} aria-hidden>
            <span className={styles.overlayTitle}>HF Master Class</span>
          </div>
        </button>

        <div className={styles.meta}>
          <dl>
            <dt>Level</dt>
            <dd>Advanced</dd>
          </dl>
          <button className={styles.viewBtn} onClick={() => setOpen(src)}>Open</button>
        </div>
      </div>

      <ImageModal src={open} alt="HF Master Class preview" onClose={() => setOpen(null)} />
    </div>
  )
}
