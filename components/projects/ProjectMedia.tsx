"use client"

import React, { useState } from 'react'
import ImageModal from '@/components/modal/ImageModal'
import styles from '@/app/projects/hotspot/hotspot.module.css'

type Props = {
  images: string[]
  title?: string
}

export default function ProjectMedia({ images, title }: Props) {
  const [open, setOpen] = useState<string | null>(null)

  const handleClick = (src: string) => setOpen(src)

  return (
    <div>
      <div className={styles.mediaRow}>
        <div className={styles.thumbs}>
          {images.slice(0,6).map((src, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={i} src={src} alt={`thumb-${i}`} className={styles.thumbImg} onClick={() => handleClick(src)} style={{cursor:'pointer'}} />
          ))}
        </div>
      </div>
      {open && <ImageModal src={open} alt={title || ''} onClose={() => setOpen(null)} />}
    </div>
  )
}
