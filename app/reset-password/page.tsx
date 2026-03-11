import styles from '../../styles/login.module.css'
import ResetPasswordClient from './ResetPasswordClient'

export default function ResetPasswordPage({ searchParams }: { searchParams?: { token?: string } }){
  const token = (searchParams && searchParams.token) || ''
  return (
    <main className={`${styles.authMain} page-pad`}>
      <div className={styles.center}>
        <ResetPasswordClient token={token} />
      </div>
    </main>
  )
}
