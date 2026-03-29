"use client"

import React, { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import Modal from '@/components/modal/Modal'
import Image from 'next/image'
import styles from './HotspotGallery.module.css'
import { getHotspotGalleryUrls } from '@/lib/siteMedia'

type Props = { images?: string[] }

export default function HotspotGallery({ images }: Props){
  const storageKey = 'kf8fvd-hotspot-images-v1'
  const [stored] = useState<string[]>(() => {
    try { const s = JSON.parse(localStorage.getItem(storageKey) || '[]'); return Array.isArray(s) ? s : [] } catch { return [] }
  })
  const imgs = [ ...(images && images.length>0 ? images : [
    ...getHotspotGalleryUrls()
  ]), ...stored ]
  const [open, setOpen] = useState<string | null>(null)

  

  useEffect(()=>{
    function onKey(e: KeyboardEvent){ if (e.key === 'Escape') setOpen(null) }
    window.addEventListener('keydown', onKey)
    return ()=> window.removeEventListener('keydown', onKey)
  },[])

  useEffect(()=>{
    if (open) {
      const prev = document.documentElement.style.overflow
      document.documentElement.style.overflow = 'hidden'
      return () => { document.documentElement.style.overflow = prev }
    }
  },[open])

  return (
    <div>
      <div className="flex-between gap-12 mb-8">
        <div className="flex-1">
          <div className={styles.gallery} aria-label="Hotspot images">
            {imgs.map((src,i)=> (
              <button key={i} type="button" className={styles.thumb} onClick={()=> setOpen(src)} aria-label={`Open hotspot image ${i + 1}`}>
                <Image src={src} alt={`Hotspot ${i+1}`} fill sizes="(max-width: 640px) 120px, 160px" unoptimized={String(src).startsWith('data:')} className={styles.img} />
              </button>
            ))}
          </div>
        </div>
        
      </div>

      {open && typeof document !== 'undefined' && createPortal(
        <Modal overlayClassName={styles.modalOverlay} contentClassName={styles.modal} onClose={() => setOpen(null)} titleId="hotspot-image-title">
          <button aria-label="Close image" className={styles.modalClose} onClick={()=> setOpen(null)}>✕</button>
          <div className={styles.openImageWrap} style={{width:'100%',maxWidth:1200}}>
            <Image src={open!} alt="Hotspot large" width={1200} height={800} sizes="92vw" unoptimized={String(open).startsWith('data:')} className={styles.openImage} />
          </div>
        </Modal>,
        document.body
      )}
    </div>
  )
}
