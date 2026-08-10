import Link from 'next/link'
import styles from './status.module.css'

export default function NotFound() {
  return (
    <main id="main" className={styles.shell}>
      <div className={styles.content}>
        <p className={styles.kicker}>404 / No contact</p>
        <h1 className={styles.title}>Page not found</h1>
        <p className={styles.message}>That frequency is quiet. The page may have moved, or the address may be incomplete.</p>
        <div className={styles.actions}>
          <Link className={`${styles.action} ${styles.actionPrimary}`} href="/">Return home</Link>
          <Link className={styles.action} href="/projects">Browse projects</Link>
        </div>
      </div>
    </main>
  )
}
