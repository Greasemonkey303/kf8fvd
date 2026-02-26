import React from 'react'
import styles from './dx.module.css'
import { Card } from '@/components'

export default function DX() {
  return (
    <main className={styles.dx}>
      <div className={styles.wrapper}>
        <Card title="DX Map" subtitle="Propagation / Spots">
          <div className={styles.mapWrap}>
            <iframe
              title="DX Map - Grand Rapids"
              src="https://www.openstreetmap.org/export/embed.html?bbox=-85.72%2C42.90%2C-85.60%2C43.02&layer=mapnik"
              style={{ border: 0 }}
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
            ></iframe>
            <p className={styles.hint}>Map is a placeholder (OpenStreetMap embed). Replace with interactive map later.</p>
          </div>
        </Card>
      </div>
    </main>
  )
}
