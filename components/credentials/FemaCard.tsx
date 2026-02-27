"use client"

import React, { useState } from 'react'
import ImageModal from '@/components/modal/ImageModal'
import styles from '../../app/credentials/credentials.module.css'

export default function FemaCard(){
  const [open, setOpen] = useState<string | null>(null)
  // inline SVG placeholder for IS-100.C
  const svg = encodeURIComponent(`
    <svg xmlns='http://www.w3.org/2000/svg' width='1200' height='800'>
      <rect width='100%' height='100%' fill='#071233'/>
      <text x='50%' y='45%' dominant-baseline='middle' text-anchor='middle' fill='#a78bfa' font-family='Arial' font-size='56'>FEMA</text>
      <text x='50%' y='60%' dominant-baseline='middle' text-anchor='middle' fill='#fef3c7' font-family='Arial' font-size='40'>IS-100.C</text>
    </svg>
  `)
  const src = `data:image/svg+xml;utf8,${svg}`

  return (
    <div className={styles.stationCard}>
      <div className={styles.headerRow}>
        <h4 className={styles.stationTitle}>FEMA</h4>
        <span className={styles.badge}>IS-100.C</span>
      </div>

      <p className={styles.lead}>Introduction to Incident Command System (IS-100.C).</p>

      <div className={styles.mediaRow}>
        <button className={styles.thumbWrap} onClick={() => setOpen(src)} style={{ padding:0, border:'none', background:'transparent' }} aria-label="Open FEMA IS-100.C preview">
          <img src={src} alt="FEMA IS-100.C preview" className={styles.licenseThumb} />
          <div className={styles.overlay} aria-hidden>
            <span className={styles.overlayTitle}>IS-100.C</span>
          </div>
        </button>

        <div className={styles.meta}>
          <dl>
            <dt>Course</dt>
            <dd>IS-100.C</dd>
          </dl>
          <button className={styles.viewBtn} onClick={() => setOpen(src)}>View</button>
        </div>
      </div>

      <ImageModal src={open} alt="FEMA preview" onClose={() => setOpen(null)} />
    </div>
  )
}
