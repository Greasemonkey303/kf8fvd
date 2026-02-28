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
    const doc = document.documentElement
    const prevOverflow = doc.style.overflow || ''
    doc.style.overflow = 'hidden'
    doc.setAttribute('data-modal-open', 'true')

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return }
      if (e.key === 'Tab') {
        // focus trap inside modal sheet
        try {
          const sheet = document.querySelector(`.${styles.sheet}`) as HTMLElement | null
          if (!sheet) return
          const focusable = Array.from(sheet.querySelectorAll<HTMLElement>(`a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])`)).filter(Boolean)
          if (focusable.length === 0) return
          const first = focusable[0]
          const last = focusable[focusable.length - 1]
          const active = document.activeElement as HTMLElement | null
          if (e.shiftKey) {
            if (active === first) { e.preventDefault(); last.focus(); }
          } else {
            if (active === last) { e.preventDefault(); first.focus(); }
          }
        } catch (err) { /* ignore focus trap errors */ }
      }
    }
    window.addEventListener('keydown', onKey)

    return () => {
      window.removeEventListener('keydown', onKey)
      try { if (doc.getAttribute('data-modal-open')) doc.removeAttribute('data-modal-open') } catch(e) {}
      try { doc.style.overflow = prevOverflow || '' } catch(e) {}
      if (prev && typeof prev.focus === 'function') prev.focus()
    }
  }, [onClose])

  if (node) return createPortal(modal, node)
  return modal
}
