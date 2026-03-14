"use client"

import React, { useEffect, useState } from 'react'
import styles from './credentials.module.css'
import SectionGrid from '@/components/credentials/SectionGrid'

export default function CredentialsClient() {
  const [sections, setSections] = useState<Record<string, Record<string, unknown>[]>>({})
  const [sectionMeta, setSectionMeta] = useState<Record<string, { name?: string; subtitle?: string }>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        const res = await fetch('/api/credentials')
        const data = await res.json()
        if (!mounted) return
        setSections((data as Record<string, unknown>)['sections'] as Record<string, Record<string, unknown>[]> || {})
        setSectionMeta((data as Record<string, unknown>)['section_meta'] as Record<string, { name?: string; subtitle?: string }> || {})
      } catch (e) {
        console.error('fetch credentials error', e)
      } finally { if (mounted) setLoading(false) }
    })()
    return () => { mounted = false }
  }, [])

  const orderedSlugs = React.useMemo(() => {
    const metaSlugs = Object.keys(sectionMeta || {})
    const otherSlugs = Object.keys(sections || {}).filter(s => !sectionMeta || !sectionMeta[s])
    return [...metaSlugs, ...otherSlugs]
  }, [sectionMeta, sections])

  return (
    <main>
      <section className="page-pad">
        {loading ? <div className="center-max">Loading credentials…</div> : null}
        {orderedSlugs.map((sec) => (
          <div key={sec} style={{ marginBottom: 18 }}>
            <SectionGrid title={sectionMeta[sec]?.name || sec} subtitle={sectionMeta[sec]?.subtitle || ''} items={sections[sec] || []} />
          </div>
        ))}
      </section>
    </main>
  )
}
