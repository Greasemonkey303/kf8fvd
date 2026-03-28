"use client"

import React, { useEffect, useState } from 'react'
import styles from './credentials.module.css'
import SectionGrid from '@/components/credentials/SectionGrid'
import type { Item } from '@/components/credentials/CredentialCard'

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
        <div className="page-intro" aria-labelledby="credentials-page-title">
          <p className="page-kicker">Credentials</p>
          <h1 id="credentials-page-title" className="page-heading">Licenses, training, and operating background</h1>
          <p className="page-deck">A public record of certifications, operating credentials, and supporting training relevant to radio, emergency communications, and technical work.</p>
        </div>
        {loading ? <div className="center-max">Loading credentials…</div> : null}
        {orderedSlugs.map((sec) => (
          <div key={sec} style={{ marginBottom: 18 }}>
            <SectionGrid title={sectionMeta[sec]?.name || sec} subtitle={sectionMeta[sec]?.subtitle || ''} items={(sections[sec] || []) as unknown as Item[]} />
          </div>
        ))}
      </section>
    </main>
  )
}
