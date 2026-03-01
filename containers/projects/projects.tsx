"use client"

import React, { useEffect, useState } from 'react'
import styles from './projects.module.css'
import { Card } from '@/components'
import { ImageModal } from '@/components'

export default function Projects() {
  const [open, setOpen] = useState<string | null>(null)
  const [items, setItems] = useState<any[]>([])

  useEffect(() => {
    let mounted = true
    ;(async ()=>{
      try {
        const res = await fetch('/api/projects')
        const data = await res.json()
        if (mounted) setItems(data.items || [])
      } catch (e) {
        console.error(e)
      }
    })()
    return ()=>{ mounted = false }
  }, [])

  return (
    <main className={styles.projects}>
      <div className={styles.grid}>
        {items.length === 0 ? (
          <>
            <Card title="Hotspot Project" subtitle="Raspberry Pi 4 + MMDVM Hotspot" className={styles.featured}>
              <div className={styles.projectInner}>
                <img src="/hotspot/hotspot-2.jpg" alt="Hotspot" className={styles.thumb} onClick={() => setOpen('/hotspot/hotspot-2.jpg')} />
                <div>
                  <p>This project documents building a compact local amateur radio hotspot using a Raspberry Pi 4 and an MMDVM HAT. Click the image to view it full-size (modal preserves aspect ratio).</p>
                  <p><a href="/projects/hotspot">Read the Hotspot Story</a></p>
                </div>
              </div>
            </Card>

            <Card title="Other Projects" subtitle="More to come">
              <div className={styles.projectInner}>
                <div className={styles.thumbFake} />
                <div>
                  <p>Additional projects will appear here. This page focuses on the Hotspot — follow the link above.</p>
                </div>
              </div>
            </Card>
          </>
        ) : (
          items.map((p) => (
            <Card key={p.id} title={p.title} subtitle={p.subtitle} className={p.slug === 'hotspot' ? styles.featured : undefined}>
              <div className={styles.projectInner}>
                {p.image_path ? <img src={p.image_path} alt={p.title} className={styles.thumb} onClick={() => setOpen(p.image_path)} /> : <div className={styles.thumbFake} />}
                <div>
                  <p dangerouslySetInnerHTML={{ __html: p.description || '' }} />
                  {p.external_link ? <p><a href={p.external_link}>Read more</a></p> : null}
                </div>
              </div>
            </Card>
          ))
        )}
      </div>

      {open && <ImageModal src={open} alt="Hotspot full" onClose={() => setOpen(null)} />}
    </main>
  )
}
