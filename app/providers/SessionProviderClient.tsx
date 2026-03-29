"use client"

import { SessionProvider } from 'next-auth/react'
import React from 'react'
import ClientErrorMonitor from '@/components/monitoring/ClientErrorMonitor'

type Props = {
  children: React.ReactNode
}

export default function SessionProviderClient({ children }: Props) {
  return (
    <SessionProvider>
      <ClientErrorMonitor />
      {children}
    </SessionProvider>
  )
}
