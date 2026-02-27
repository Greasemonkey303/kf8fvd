"use client"

import React from 'react'
import styles from './imageModal.module.css'

type Props = {
  src: string | null
  alt?: string
  onClose: () => void
}

export default function ImageModal({ src, alt = '', onClose }: Props) {
  if (!src) return null
  return (
    <div className={styles.backdrop} onClick={onClose} role="dialog" aria-modal="true">
      <div className={styles.sheet} onClick={(e) => e.stopPropagation()}>
        <button className={styles.close} onClick={onClose} aria-label="Close image">✕</button>
        <img src={src} alt={alt} className={styles.image} />
      </div>
    </div>
  )
}
