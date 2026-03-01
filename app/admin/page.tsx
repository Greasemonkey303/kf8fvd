"use client"

import React from 'react'
import { useSession, signIn, signOut } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { Card } from '@/components'

export default function AdminPage() {
  const { data: session, status } = useSession()
  const router = useRouter()

  if (status === 'loading') return <main className="page-pad"><p>Loading…</p></main>
  if (!session) {
    return (
      <main className="page-pad">
        <div className="center-max">
          <Card title="Admin" subtitle="Sign in to access admin features">
            <div className="stack">
              <p>You must be signed in to access the admin console.</p>
              <div className="flex gap-2">
                <button className="btn-ghost" onClick={() => signIn()}>Sign In</button>
                <button className="btn-ghost" onClick={() => router.push('/')}>Go Home</button>
              </div>
            </div>
          </Card>
        </div>
      </main>
    )
  }

  return (
    <main className="page-pad">
      <div className="center-max">
        <Card title="Admin Console" subtitle={`Welcome, ${session.user?.name || session.user?.email}`}>
          <div className="grid cols-2 gap-4">
            <div className="card-action"><a href="/admin/messages">Messages</a></div>
            <div className="card-action"><a href="/admin/pages">Pages</a></div>
            <div className="card-action"><a href="/admin/users">Users</a></div>
            <div className="card-action"><button onClick={() => signOut()} className="btn-ghost">Sign Out</button></div>
          </div>
        </Card>
      </div>
    </main>
  )
}
