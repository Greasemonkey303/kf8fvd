import type { ComponentProps } from 'react'
import AdminPageClient from './AdminPageClient'
import { setOnAirStateAction } from './actions'
import { getAdminDashboardData, getAdminMonitoringData, getAdminOnAirData } from './serverData'

type AdminPageClientProps = ComponentProps<typeof AdminPageClient>

export default async function AdminPage() {
  const [dashboardData, monitoringData, onAirData] = await Promise.all([
    getAdminDashboardData<AdminPageClientProps['initialDashboard']>(),
    getAdminMonitoringData<AdminPageClientProps['initialMonitoring']>(),
    getAdminOnAirData<{ item?: Record<string, unknown> | null }>(),
  ])

  return (
    <AdminPageClient
      initialDashboard={dashboardData}
      initialMonitoring={monitoringData}
      initialMonitoringError={monitoringData ? null : 'Live monitoring is temporarily unavailable.'}
      initialOnAir={onAirData?.item || null}
      updateOnAirAction={setOnAirStateAction}
    />
  )
}