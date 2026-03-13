import styles from '../../styles/login.module.css'
import ResetPasswordClient from './ResetPasswordClient'

export default async function ResetPasswordPage({ searchParams }: { searchParams?: any }){
  // `searchParams` may be a Promise in Next.js; await if necessary
  const sp = (searchParams ? await searchParams : {}) || {}
  const token = String(sp.token || '')
  return (
    <main className={`${styles.authMain} page-pad`}>
      <div className={styles.center}>
        <ResetPasswordClient token={token} />
      </div>
    </main>
  )
}
