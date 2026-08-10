import styles from './status.module.css'

export default function Loading() {
  return (
    <main id="main" className={styles.shell} aria-live="polite" aria-busy="true">
      <div className={styles.content}>
        <p className={styles.kicker}>Tuning</p>
        <h1 className={styles.title}>Loading station data</h1>
        <div className={styles.loadingBar} aria-hidden />
      </div>
    </main>
  )
}
