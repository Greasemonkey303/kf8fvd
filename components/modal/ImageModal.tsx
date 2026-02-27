"use client"

import React, { useEffect, useRef } from 'react'
import styles from './imageModal.module.css'
import { createPortal } from 'react-dom'

type Props = {
  src: string | null
  alt?: string
  onClose: () => void
}

export default function ImageModal({ src, alt = '', onClose }: Props) {
  if (!src) return null
  const node = (typeof document !== 'undefined') ? document.body : null
  const modal = (
    <div className={styles.backdrop} onClick={onClose} role="dialog" aria-modal="true">
      <div className={styles.sheet} onClick={(e) => e.stopPropagation()}>
        <button className={styles.close} onClick={onClose} aria-label="Close image">✕</button>
        <img src={src} alt={alt} className={styles.image} />
      </div>
    </div>
  )

  const closeRef = useRef<HTMLButtonElement | null>(null)
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null
    // focus close button
    const btn = document.querySelector(`.${styles.close}`) as HTMLButtonElement | null
    if (btn) btn.focus()

    // lock scroll
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)

    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
      if (prev && typeof prev.focus === 'function') prev.focus()
    }
  }, [onClose])

  if (node) return createPortal(modal, node)
  return modal
}
