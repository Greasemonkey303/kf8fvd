import React from 'react'
import { Card } from '@/components'

export const metadata = {
  title: 'Credentials - KF8FVD',
  description: 'Credentials and certifications for KF8FVD',
}

export default function CredentialsPage() {
  return (
    <main>
      <section style={{ padding: '2rem' }}>
        <Card title="Credentials" subtitle="KF8FVD">
          <p>Callsign: KF8FVD</p>
          <h3>Licenses & Certifications</h3>
          <ul>
            <li>Amateur Radio License - Technician / General (update as needed)</li>
            <li>Additional certifications can be listed here.</li>
          </ul>
        </Card>
      </section>
    </main>
  )
}
