import React from 'react'
import { Card } from '@/components'
import styles from './credentials.module.css'
import LicenseCard from '@/components/credentials/LicenseCard'
import EcomCard from '@/components/credentials/EcomCard'
import FemaCard from '@/components/credentials/FemaCard'
import Is700Card from '@/components/credentials/Is700Card'
import HFMasterCard from '@/components/credentials/HFMasterCard'
import SatelliteCard from '@/components/credentials/SatelliteCard'

export const metadata = {
  title: 'Credentials - KF8FVD',
  description: 'Credentials and certifications for KF8FVD',
}

export default function CredentialsPage() {
  return (
    <main>
      <section style={{ padding: '2rem' }}>
        <Card title="Licenses & Certifications" subtitle='KF8FVD' className={styles.noAnimCard}>
          <div className={styles.twoColumn}>
           {/* <div className={styles.leftCol}>
              <h3>Licenses & Certifications</h3>
              <ul>
                <li>Amateur Radio License - Technician</li>
                <li>Additional certifications can be listed here.</li>
              </ul>
            </div>*/}

            <div className={styles.leftCol}>
              <div className={styles.cardGrid}>
                <div className={`${styles.innerCard} ${styles.withAnim}`}><LicenseCard /></div>
              </div>
            </div>

            <div className={styles.rightCol}>
              {/* reserved for notes or details */}
            </div>
          </div>
        </Card>

        <Card title="Ham Radio Prep" subtitle="Study materials and resources for emergency communications" className={styles.noAnimCard}>
          <div className={styles.twoColumn}>
            <div className={styles.leftCol}>
              <div className={styles.cardGrid}>
                <div className={`${styles.innerCard} ${styles.withAnim}`}><EcomCard /></div>
                <div className={`${styles.innerCard} ${styles.withAnim}`}><HFMasterCard /></div>
                <div className={`${styles.innerCard} ${styles.withAnim}`}><SatelliteCard /></div>
              </div>
            </div>

            <div className={styles.rightCol}>
              {/* description or links can go here */}
            </div>
          </div>
        </Card>

         <Card title="FEMA" subtitle='Disaster Communications Training' className={styles.noAnimCard}>
          <div className={styles.twoColumn}>
            <div className={styles.leftCol}>
              <div className={styles.cardGrid}>
                <div className={`${styles.innerCard} ${styles.withAnim}`}><FemaCard /></div>
                <div className={`${styles.innerCard} ${styles.withAnim}`}><Is700Card /></div>
              </div>
            </div>

            <div className={styles.rightCol}>
              {/* FEMA course notes could go here */}
            </div>
          </div>
        </Card>
      </section>
    </main>
  )
}
