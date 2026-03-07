"use client"

import React, { useEffect, useState } from 'react'
import styles from './credentials.module.css'
import SectionGrid from '@/components/credentials/SectionGrid'

export default function CredentialsClient() {
  const [sections, setSections] = useState<Record<string, any[]>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        const res = await fetch('/api/credentials')
        const data = await res.json()
        if (!mounted) return
        setSections(data.sections || {})
      } catch (e) {
        console.error('fetch credentials error', e)
      } finally { if (mounted) setLoading(false) }
    })()
    return () => { mounted = false }
  }, [])

  return (
    <main>
      <section className="page-pad">
        {loading ? <div className="center-max">Loading credentials…</div> : null}
        {Object.keys(sections).map((sec) => (
          <div key={sec} style={{ marginBottom: 18 }}>
            <SectionGrid title={sec} items={sections[sec] || []} />
          </div>
        ))}
      </section>
    </main>
  )
}
