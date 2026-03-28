import React from 'react'
import styles from './dx.module.css'
import { Card } from '@/components'
import { ContactMap } from '@/components'

const operatingHighlights = [
  { title: 'Operating Focus', text: 'This station leans into local VHF/UHF activity, digital voice, and practical station-side projects instead of acting like a static bio page.' },
  { title: 'Digital Workflow', text: 'D-STAR, DMR, FM, and hotspot-related work tie this page back to the rest of the site, especially projects and contact activity.' },
  { title: 'Map Purpose', text: 'The DX map gives a quick read on where logged contacts cluster over time using cached geocoding derived from station log data.' },
]

const dxNotes = [
  'Use it as a simple operating footprint instead of a decorative map.',
  'It helps show whether activity is mostly local, regional, or tied to travel and portable operation.',
  'It gives visitors quick context for the kind of radio work and experimentation happening on the site.',
]

export default function DX() {
  return (
    <main className={styles.dx} aria-labelledby="dx-page-title">
      <div className={styles.wrapper}>
        <div className="page-intro">
          <p className="page-kicker">DX</p>
          <h1 id="dx-page-title" className="page-heading">Map contacts and spot operating patterns</h1>
          <p className="page-deck">This map view highlights logged contact locations using locally cached geocoding so the operating footprint is easy to scan without leaving the site.</p>
        </div>
        <Card title="DX Map" subtitle="Propagation / Spots">
          <div className={styles.mapWrap}>
            <ContactMap />
            <p className={styles.hint}>Map shows pins for contact locations derived from your local logbook (geocoded via OpenStreetMap). Results are cached locally.</p>
          </div>
        </Card>

        <div className={styles.supportGrid}>
          <Card title="Station Snapshot" subtitle="Why this page exists">
            <div className={styles.infoStack}>
              {operatingHighlights.map((item) => (
                <div key={item.title} className={styles.infoBlock}>
                  <h3 className={styles.infoTitle}>{item.title}</h3>
                  <p className={styles.infoText}>{item.text}</p>
                </div>
              ))}
            </div>
          </Card>

          <Card title="Reading The Map" subtitle="Ham-radio context">
            <ul className={styles.noteList}>
              {dxNotes.map((note) => <li key={note}>{note}</li>)}
            </ul>
            <div className={styles.radioCallout}>
              <strong className={styles.calloutTitle}>Radio-first presentation</strong>
              <p className={styles.calloutText}>For a ham radio site, this page should explain the station footprint, not just show a blank map block. These notes give the section more purpose and make it feel finished.</p>
            </div>
          </Card>
        </div>
      </div>
    </main>
  )
}
