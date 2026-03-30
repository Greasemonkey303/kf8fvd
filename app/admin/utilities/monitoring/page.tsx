import type { ComponentProps } from 'react'
import MonitoringPageClient from './MonitoringPageClient'
import { getAdminMonitoringData } from '../../serverData'

type MonitoringPageClientProps = ComponentProps<typeof MonitoringPageClient>

export default async function MonitoringPage() {
  const initialData = await getAdminMonitoringData<MonitoringPageClientProps['initialData']>()

  return (
    <MonitoringPageClient
      initialData={initialData}
      initialError={initialData ? null : 'Failed to load monitoring.'}
    />
  )
}