import React from 'react'
import Image from 'next/image'
import styles from './projects.module.css'
import { Card } from '@/components'

export default function Projects() {
  return (
    <main className={styles.projects}>
      <div className={styles.grid}>
        <Card title="Hotspot Project" subtitle="Raspberry Pi 4 + MMDVM Hotspot" className={styles.featured}>
          <div className={styles.projectInner}>
            <Image src="/hotspot-placeholder.png" alt="Hotspot" className={styles.thumb} width={220} height={140} />
            <div>
              <p>This project documents building a compact local amateur radio hotspot using a Raspberry Pi 4 and an MMDVM HAT. Click through for a short story, hardware & software notes, links, and a place to add your photo.</p>
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
      </div>
    </main>
  )
}
