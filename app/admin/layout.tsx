import { ReactNode } from 'react'
import { redirect } from 'next/navigation'
import { requireAdmin } from '../../lib/auth'

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const admin = await requireAdmin()
  if (!admin) {
    redirect('/signin?callbackUrl=/admin')
  }
  return (
    <div>
      {children}
    </div>
  )
}
