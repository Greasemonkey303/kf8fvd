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
          <h3 className={styles.sectionTitle}>Auth Locks</h3>
          <p className={styles.smallMuted}>View and clear account/IP locks created by the rate limiter.</p>
          <div className={styles.controls}>
            <Link href="/admin/utilities/locks" className={styles.btnGhost}>View locks</Link>
          </div>
        </div>

        <div className={styles.adminSectionCard}>
          <h3 className={styles.sectionTitle}>Login Attempts</h3>
          <p className={styles.smallMuted}>Browse recent successful and failed login attempts for auditing.</p>
          <div className={styles.controls}>
            <Link href="/admin/utilities/login-attempts" className={styles.btnGhost}>View attempts</Link>
          </div>
        </div>

        <div className={styles.adminSectionCard}>
          <h3 className={styles.sectionTitle}>Monitoring</h3>
          <p className={styles.smallMuted}>Inspect dependency health, abuse counters, and storage policy status.</p>
          <div className={styles.controls}>
            <Link href="/admin/utilities/monitoring" className={styles.btnGhost}>Open monitoring</Link>
          </div>
        </div>

        <div className={styles.adminSectionCard}>
          <h3 className={styles.sectionTitle}>Call Log (ADIF)</h3>
          <p className={styles.smallMuted}>Upload and manage ADIF (.adi) call logs for the DX map and Recent QSOs.</p>
          <div className={styles.controls}>
            <Link href="/admin/utilities/call-log" className={styles.btnGhost}>Manage call log</Link>
          </div>
        </div>

        <div className={styles.adminSectionCard}>
          <h3 className={styles.sectionTitle}>Create User</h3>
          <p className={styles.smallMuted}>Create new administrative or editorial users (admin-only).</p>
          <div className={styles.controls}>
            <Link href="/admin/utilities/create-user" className={styles.btnGhost}>Create user</Link>
          </div>
        </div>
      </div>
    </main>
  )
}
