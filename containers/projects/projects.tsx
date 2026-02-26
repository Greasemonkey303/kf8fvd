import React from 'react'
import styles from './projects.module.css'
import { Card } from '@/components'

export default function Projects() {
  return (
    <main className={styles.projects}>
      <div className={styles.grid}>
        <Card title="Hotspot" subtitle="Local hotspot">
          <div className={styles.projectInner}>
            <img src="/hotspot-placeholder.png" alt="Hotspot" className={styles.thumb} />
            <div>
              <p>Hotspot project placeholder. Replace <code>/public/hotspot-placeholder.png</code> with your image.</p>
              <p><a href="/projects/hotspot">Open Hotspot</a></p>
            </div>
          </div>
        </Card>

        <Card title="Project One" subtitle="Placeholder">
          <div className={styles.projectInner}>
            <div className={styles.thumbFake} />
            <div>
              <p>Placeholder project card.</p>
            </div>
          </div>
        </Card>

        <Card title="Project Two" subtitle="Placeholder">
          <div className={styles.projectInner}>
            <div className={styles.thumbFake} />
            <div>
              <p>Placeholder project card.</p>
            </div>
          </div>
        </Card>
      </div>
    </main>
  )
}
