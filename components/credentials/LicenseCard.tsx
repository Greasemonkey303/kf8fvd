"use client"

import React, { useState } from 'react'
import { ImageModal } from '@/components'
import Image from 'next/image'
import styles from '../../app/credentials/credentials.module.css'

function getCssVar(name: string, fallback: string) {
  if (typeof window === 'undefined') return fallback
  const v = getComputedStyle(document.documentElement).getPropertyValue(name)
  return v ? v.trim() : fallback
}

export default function LicenseCard(){
  const [open, setOpen] = useState<string | null>(null)
  const [err, setErr] = useState(false)
  const src = '/credentials/license.jpg'

  const bg = getCssVar('--color-bg', '#0f172a')
  const text = getCssVar('--white-100', '#ffffff')
  const fallback = `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='1200' height='800'><rect width='100%' height='100%' fill='${bg}'/><text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle' fill='${text}' font-family='Arial' font-size='32'>Image unavailable</text></svg>`)}`

  return (
    <div className={styles.stationCard}>
      <div className={styles.headerRow}>
        <h4 className={styles.stationTitle}>Station License</h4>
        <span className={styles.badge}>Primary</span>
      </div>

      <p className={styles.lead}>Official FCC license for station callsign KF8FVD. Click the image to open full size.</p>

      <div className={styles.mediaRow}>
        <button className={styles.thumbWrap} onClick={() => setOpen(err ? fallback : src)} aria-label="Open Station License preview">
          {err ? (
            <img src={fallback} alt="Station License unavailable" className={styles.licenseThumb} />
          ) : (
            <Image src={src} alt="Station License" width={1200} height={800} className={styles.licenseThumb} onError={() => setErr(true)} />
          )}
          <div className={styles.overlay} aria-hidden>
            <span className={styles.overlayTitle}>Station License</span>
          </div>
        </button>

        <div className={styles.meta}>
          <dl>
            <dt>Authority</dt>
            <dd>FCC</dd>
          </dl>
          <button className={styles.viewBtn} onClick={() => setOpen(err ? fallback : src)}>View</button>
        </div>
      </div>

      {open && <ImageModal src={open} alt="Station License" onClose={() => setOpen(null)} />}
    </div>
  )
}
