import Link from 'next/link'
import styles from '../admin.module.css'

export default function UtilitiesLanding() {
  return (
    <main>
      <div className={styles.adminTop}>
        <div className="title">Utilities</div>
      </div>

      <div className={styles.sectionsGrid}>
        <div className={styles.adminSectionCard}>
          <h3 style={{margin:0}}>Auth Locks</h3>
          <p className={styles.smallMuted}>View and clear account/IP locks created by the rate limiter.</p>
          <div className={styles.controls}>
            <Link href="/admin/utilities/locks" className={styles.btnGhost}>View locks</Link>
          </div>
        </div>

        <div className={styles.adminSectionCard}>
          <h3 style={{margin:0}}>Login Attempts</h3>
          <p className={styles.smallMuted}>Browse recent successful and failed login attempts for auditing.</p>
          <div className={styles.controls}>
            <Link href="/admin/utilities/login-attempts" className={styles.btnGhost}>View attempts</Link>
          </div>
        </div>
      </div>
    </main>
  )
}
