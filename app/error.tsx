'use client'

import Link from 'next/link'
import { useEffect } from 'react'
import styles from './status.module.css'

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('Unhandled page error', { digest: error.digest })
  }, [error])

  return (
    <main id="main" className={styles.shell}>
      <div className={styles.content}>
        <p className={styles.kicker}>Signal interrupted</p>
        <h1 className={styles.title}>Page unavailable</h1>
        <p className={styles.message}>The request could not be completed. Try it again or return to the station homepage.</p>
        <div className={styles.actions}>
          <button type="button" className={`${styles.action} ${styles.actionPrimary}`} onClick={reset}>Try again</button>
          <Link className={styles.action} href="/">Home</Link>
        </div>
      </div>
    </main>
  )
}
