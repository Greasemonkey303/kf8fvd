import styles from '@/app/admin/admin.module.css'

type AdminNoticeProps = {
  message: string
  variant?: 'error' | 'success' | 'info'
  actionLabel?: string
  onAction?: () => void
  className?: string
}

export default function AdminNotice({
  message,
  variant = 'info',
  actionLabel,
  onAction,
  className,
}: AdminNoticeProps) {
  const variantClass =
    variant === 'error'
      ? styles.noticeError
      : variant === 'success'
        ? styles.noticeSuccess
        : styles.noticeInfo

  return (
    <div className={[styles.notice, variantClass, className].filter(Boolean).join(' ')} role={variant === 'error' ? 'alert' : 'status'} aria-live={variant === 'error' ? 'assertive' : 'polite'}>
      <span className={styles.noticeMessage}>{message}</span>
      {actionLabel && onAction ? (
        <button type="button" className={styles.noticeAction} onClick={onAction}>
          {actionLabel}
        </button>
      ) : null}
    </div>
  )
}