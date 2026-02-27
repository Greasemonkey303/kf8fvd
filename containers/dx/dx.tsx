import React from 'react'
import styles from './dx.module.css'
import { Card } from '@/components'
import ContactMap from '@/components/map/ContactMap'

export default function DX() {
  return (
    <main className={styles.dx}>
      <div className={styles.wrapper}>
        <Card title="DX Map" subtitle="Propagation / Spots">
          <div className={styles.mapWrap}>
            <ContactMap />
            <p className={styles.hint}>Map shows pins for contact locations derived from your local logbook (geocoded via OpenStreetMap). Results are cached locally.</p>
          </div>
        </Card>
      </div>
    </main>
  )
}
