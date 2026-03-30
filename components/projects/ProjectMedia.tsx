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
  const uniqueImages = Array.from(new Set(images.filter(Boolean)))

  return (
    <div className={styles.mediaGalleryShell}>
      <div className={styles.mediaRow}>
        <div className={styles.thumbs}>
          {uniqueImages.slice(0, 8).map((src, i) => (
            <button key={`${i}-${src}`} type="button" className={styles.thumbButton} onClick={() => handleClick(src)} aria-label={`Open ${title || 'project'} image ${i + 1}`}>
              <Image src={src} alt={`${title || 'Project'} image ${i + 1}`} width={900} height={600} className={styles.thumbImg} loading="lazy" sizes="(max-width: 639px) 100vw, (max-width: 979px) 50vw, 33vw" unoptimized={String(src).startsWith('data:') || String(src).startsWith('blob:')} />
            </button>
          ))}
        </div>
      </div>
      {open && <ImageModal src={open} alt={title || ''} onClose={() => setOpen(null)} />}
    </div>
  )
}
