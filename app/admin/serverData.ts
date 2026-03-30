import 'server-only'

import { cookies } from 'next/headers'

function getInternalAppOrigin() {
  return (process.env.INTERNAL_APP_ORIGIN || `http://127.0.0.1:${process.env.PORT || '3000'}`).trim()
}

async function fetchAdminJson<T>(pathname: string): Promise<T | null> {
  const cookieHeader = (await cookies()).toString()
  if (!cookieHeader) return null

  try {
    const response = await fetch(new URL(pathname, getInternalAppOrigin()), {
      headers: { cookie: cookieHeader },
      cache: 'no-store',
    })
    if (!response.ok) return null
    return await response.json() as T
  } catch {
    return null
  }
}

export function getAdminDashboardData<T>() {
  return fetchAdminJson<T>('/admin/dashboard-data')
}

export function getAdminMonitoringData<T>() {
  return fetchAdminJson<T>('/admin/monitoring')
}

export function getAdminOnAirData<T>() {
  return fetchAdminJson<T>('/admin/onair')
}