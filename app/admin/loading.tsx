import styles from '../status.module.css'

export default function AdminLoading() {
  return (
    <main id="main" className={styles.shell} aria-live="polite" aria-busy="true">
      <div className={styles.content}>
        <p className={styles.kicker}>Admin</p>
        <h1 className={styles.title}>Loading dashboard</h1>
        <div className={styles.loadingBar} aria-hidden />
      </div>
    </main>
  )
}
