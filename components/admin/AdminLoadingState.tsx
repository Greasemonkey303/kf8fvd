import styles from '@/app/admin/admin.module.css'

type AdminLoadingStateProps = {
  label?: string
}

export default function AdminLoadingState({ label = 'Loading' }: AdminLoadingStateProps) {
  return (
    <div className={styles.loadingState} role="status" aria-live="polite">
      <span className={`${styles.spinner} ${styles.loadingSpinner}`} aria-hidden />
      <span className={styles.loadingLabel}>{label}</span>
    </div>
  )
}