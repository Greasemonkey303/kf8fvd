'use client'

import Link from 'next/link'
import { useEffect } from 'react'
import styles from '../status.module.css'

export default function AdminError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('Unhandled admin page error', { digest: error.digest })
  }, [error])

  return (
    <main id="main" className={styles.shell}>
      <div className={styles.content}>
        <p className={styles.kicker}>Admin request interrupted</p>
        <h1 className={styles.title}>Unable to load admin</h1>
        <p className={styles.message}>No changes were submitted from this error screen. Retry the request or return to the dashboard.</p>
        <div className={styles.actions}>
          <button type="button" className={`${styles.action} ${styles.actionPrimary}`} onClick={reset}>Try again</button>
          <Link className={styles.action} href="/admin">Dashboard</Link>
        </div>
      </div>
    </main>
  )
}
