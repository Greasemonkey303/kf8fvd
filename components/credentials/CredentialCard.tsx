"use client"

import React, { useState } from 'react'
import styles from '../../app/credentials/credentials.module.css'
import ImageModal from '../modal/ImageModal'
import createDOMPurify from 'dompurify'

type Item = {
  id: number
  section?: string
  slug?: string
  s3_prefix?: string
  title?: string
  tag?: string
  authority?: string
  image_path?: string | null
  description?: string | null
}

export default function CredentialCard({ item }: { item: Item }) {
  const [imgOpen, setImgOpen] = useState(false)
  const src = item.image_path || null
  const purify = typeof window !== 'undefined' ? createDOMPurify(window as any) : null

  return (
    <div className={styles.innerCardWrapper}>
      <div className={styles.stationCard}>
        <div className={styles.headerRow}>
          <div className={styles.headerLeft}>
            <h4 className={styles.stationTitle}>{item.title}</h4>
          </div>
          {item.tag ? <div className={styles.badge}>{item.tag}</div> : null}
        </div>

        <div className={styles.mediaRow}>
          <div className={styles.thumbWrap} role="button" tabIndex={0} aria-label={src ? `Open ${item.title}` : 'No image'} onClick={()=>{ if (src) setImgOpen(true) }} onKeyDown={(e:any)=>{ if (e.key === 'Enter' || e.key === ' ') { if (src) setImgOpen(true) } }}>
            {src ? (
              <img className={styles.licenseThumb} src={src} alt={item.title || ''} />
            ) : (
              <div className={styles.licenseThumb} style={{display:'flex',alignItems:'center',justifyContent:'center',color:'#9fb7d6'}}>Coming soon</div>
            )}
          </div>
          <div className={styles.meta}>
            {item.authority ? (
              <div className={styles.metaAuthority}>
                <div className={styles.metaAuthorityLabel}>Authority</div>
                <div className={styles.metaAuthorityValue}>{item.authority}</div>
              </div>
            ) : null}

            {item.description ? (
              <div className={styles.description} dangerouslySetInnerHTML={{ __html: purify ? purify.sanitize(String(item.description || '')) : (item.description || '') }} />
            ) : null}

            <div className={styles.actions}>
              <button className={styles.viewBtn} onClick={() => setImgOpen(true)}>View</button>
            </div>
          </div>
        </div>
      </div>
      <ImageModal src={imgOpen ? src : null} alt={item.title || ''} onClose={() => setImgOpen(false)} />
    </div>
  )
}
