"use client"

import React from 'react'
import Card from '../card/card'
import CredentialCard from './CredentialCard'
import styles from '../../app/credentials/credentials.module.css'

export default function SectionGrid({ title, subtitle, items }: { title: string; subtitle?: string; items: any[] }) {
  return (
    <Card title={title} subtitle={subtitle} className={styles.noAnimCard}>
      <div className={styles.twoColumn}>
        <div className={styles.leftCol}>
          <div className={styles.cardGrid}>
            {items.map((it: any) => (
              <div key={it.id} className={`${styles.innerCard} ${styles.withAnim}`}>
                <CredentialCard item={it} />
              </div>
            ))}
          </div>
        </div>
        <div className={styles.rightCol} />
      </div>
    </Card>
  )
}
