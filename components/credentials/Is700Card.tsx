"use client"

import React, { useState } from 'react'
import ImageModal from '@/components/modal/ImageModal'
import styles from '../../app/credentials/credentials.module.css'

export default function Is700Card(){
  const [open, setOpen] = useState<string | null>(null)
  const svg = encodeURIComponent(`
    <svg xmlns='http://www.w3.org/2000/svg' width='1200' height='800'>
      <rect width='100%' height='100%' fill='#04263a'/>
      <text x='50%' y='45%' dominant-baseline='middle' text-anchor='middle' fill='#60c5a1' font-family='Arial' font-size='56'>FEMA</text>
      <text x='50%' y='60%' dominant-baseline='middle' text-anchor='middle' fill='#fef3c7' font-family='Arial' font-size='40'>IS-700.B</text>
    </svg>
  `)
  const src = `data:image/svg+xml;utf8,${svg}`

  return (
    <div className={styles.stationCard}>
      <div className={styles.headerRow}>
        <h4 className={styles.stationTitle}>FEMA</h4>
        <span className={styles.badge}>IS-700.B</span>
      </div>

      <p className={styles.lead}>An introduction to the National Incident Management System (IS-700.B).</p>

      <div className={styles.mediaRow}>
        <button className={styles.thumbWrap} onClick={() => setOpen(src)} style={{ padding:0, border:'none', background:'transparent' }} aria-label="Open FEMA IS-700.B preview">
          <img src={src} alt="FEMA IS-700.B preview" className={styles.licenseThumb} />
          <div className={styles.overlay} aria-hidden>
            <span className={styles.overlayTitle}>IS-700.B</span>
          </div>
        </button>

        <div className={styles.meta}>
          <dl>
            <dt>Course</dt>
            <dd>IS-700.B</dd>
          </dl>
          <button className={styles.viewBtn} onClick={() => setOpen(src)}>View</button>
        </div>
      </div>

      <ImageModal src={open} alt="FEMA IS-700.B preview" onClose={() => setOpen(null)} />
    </div>
  )
}
