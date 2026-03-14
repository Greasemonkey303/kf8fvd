"use client"

import React, { useState } from 'react'
import ImageModal from '@/components/modal/ImageModal'
import Image from 'next/image'
import styles from '../../app/projects/hotspot/hotspot.module.css'

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
            <div key={`${i}-${src}`} className={styles.thumbWrapper} style={{display:'inline-block',cursor:'pointer'}} onClick={() => handleClick(src)}>
              <Image src={src} alt={`thumb-${i}`} width={240} height={160} className={styles.thumbImg} loading="lazy" unoptimized={String(src).startsWith('data:') || String(src).startsWith('blob:')} />
            </div>
          ))}
        </div>
      </div>
      {open && <ImageModal src={open} alt={title || ''} onClose={() => setOpen(null)} />}
    </div>
  )
}
