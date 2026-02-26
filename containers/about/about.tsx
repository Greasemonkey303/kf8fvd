import React from 'react'
import styles from './about.module.css'
import { Card } from '@/components'

export default function About() {
  return (
    <main className={styles.about}>
      <div className={styles.wrapper}>
        <Card title="About Me" subtitle="KF8FVD">
          <div className={styles.content}>
            <img src="/avatar-placeholder.png" alt="Your picture" className={styles.avatar} />
            <div className={styles.copy}>
              <p>
                Hi — I’m Zach (KF8FVD). This is a placeholder About page. Replace the picture with
                your photo at <code>/public/avatar-placeholder.png</code>.
              </p>
              <p>
                I operate VHF/UHF and enjoy repeaters, digital modes, and experimenting with antennas.
              </p>
            </div>
          </div>
        </Card>
      </div>
    </main>
  )
}
