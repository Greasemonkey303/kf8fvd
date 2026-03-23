"use client"

import Link from 'next/link'
import React, { useEffect, useState } from 'react'
import styles from './projects.module.css'
import createDOMPurify from 'dompurify'
import Image from 'next/image'
import { buildPublicUrl } from '@/lib/s3'
import useAdmin from '@/components/hooks/useAdmin'
import { Card } from '@/components'

type ProjectItem = {
  id: number
  slug?: string
  title?: string
  subtitle?: string
  image_path?: string
  description?: string
  description_sanitized?: string
}

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) return error.message
  return String(error)
}

export default function Projects() {
  const [items, setItems] = useState<ProjectItem[]>([])
  const [uploadingId, setUploadingId] = useState<number | null>(null)
  const { isAdmin } = useAdmin()
  const purify = typeof window !== 'undefined' ? createDOMPurify(window as unknown as Window & typeof globalThis) : null
  if (purify && typeof purify.setConfig === 'function') purify.setConfig({ FORBID_TAGS: ['script', 'style'] })

  useEffect(() => {
    let mounted = true
    ;(async ()=>{
      try {
        const res = await fetch('/api/projects')
        const data = await res.json()
        if (mounted) setItems(data.items || [])
      } catch (e) {
        console.error(e)
      }
    })()
    return ()=>{ mounted = false }
  }, [])

  return (
    <main className={styles.projects}>
      <div className={styles.grid}>
        {items.length === 0 ? (
          <>
            <Card title="Hotspot Project" subtitle="Raspberry Pi 4 + MMDVM Hotspot" className={styles.featured}>
              <div className={styles.projectInner}>
                <div className={styles.thumbFake} />
                <div>
                  <p>This project documents building a compact local amateur radio hotspot using a Raspberry Pi 4 and an MMDVM HAT.</p>
                  <p><Link href="/projects/hotspot">Read the Hotspot Story</Link></p>
                </div>
              </div>
            </Card>

            <Card title="Other Projects" subtitle="More to come">
              <div className={styles.projectInner}>
                <div className={styles.thumbFake} />
                <div>
                  <p>Additional projects will appear here. This page focuses on the Hotspot — follow the link above.</p>
                </div>
              </div>
            </Card>
          </>
        ) : (
          items.map((p) => (
            <Card key={p.id} title={p.title} subtitle={p.subtitle} className={p.slug === 'hotspot' ? styles.featured : undefined}>
              <div className={styles.projectInner}>
                <div className={styles.imgWrap}>
                  {p.image_path ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      (() => {
                        try {
                          const pathVal = p.image_path
                          let imageSrc: string | undefined
                          if (typeof pathVal === 'string') {
                            if (pathVal.indexOf('X-Amz-Algorithm') !== -1 || pathVal.indexOf('minio') !== -1 || pathVal.indexOf('127.0.0.1') !== -1) {
                              try {
                                const u = new URL(pathVal)
                                let path = u.pathname.replace(/^\//, '')
                                const bucket = process.env.NEXT_PUBLIC_S3_BUCKET
                                if (bucket && path.startsWith(bucket + '/')) path = path.slice(bucket.length + 1)
                                imageSrc = buildPublicUrl(path)
                              } catch (e) {
                                imageSrc = buildPublicUrl(pathVal)
                              }
                            } else if (pathVal.startsWith('http') || pathVal.startsWith('/')) {
                              imageSrc = pathVal
                            } else {
                              imageSrc = buildPublicUrl(pathVal)
                            }
                          }
                          if (imageSrc) {
                            const finalImageSrc = imageSrc
                            return (
                              <Image src={finalImageSrc} alt={p.title || 'Project image'} className={styles.thumb} width={320} height={200} unoptimized={finalImageSrc.startsWith('data:') || finalImageSrc.startsWith('blob:') || finalImageSrc.indexOf('X-Amz-Algorithm') !== -1 || finalImageSrc.indexOf('minio') !== -1 || finalImageSrc.indexOf('127.0.0.1') !== -1} />
                            )
                          }
                        } catch (e) {
                          // fallthrough to placeholder
                        }
                        return <div className={styles.thumbFake} />
                      })()
                    ) : (
                      <div className={styles.thumbFake} />
                    )}
                  {isAdmin && (
                    <div className={styles.imgControls}>
                    <button title="Edit image URL" onClick={async ()=>{
                      const val = prompt('Edit image URL', p.image_path || '')
                      if (val === null) return
                      try {
                        const res = await fetch('/api/admin/projects', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: p.id, image_path: val }) })
                        if (!res.ok) throw new Error('Save failed')
                        setItems(prev => prev.map(it => it.id === p.id ? { ...it, image_path: val } : it))
                      } catch (error: unknown) { alert('Could not save: ' + getErrorMessage(error)) }
                    }}>✎</button>
                    <button title="Delete image" onClick={async ()=>{
                      if (!p.image_path) return
                      if (!confirm('Delete this image from the project and storage?')) return
                      try {
                        // ask server to delete the object then clear image_path
                        await fetch('/api/uploads/delete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: p.image_path }) })
                      } catch (e) {
                        // ignore delete errors
                      }
                      try {
                        await fetch('/api/admin/projects', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: p.id, image_path: '' }) })
                        setItems(prev => prev.map(it => it.id === p.id ? { ...it, image_path: '' } : it))
                      } catch (error: unknown) { alert('Could not clear image_path: ' + getErrorMessage(error)) }
                    }}>🗑</button>
                    <label title="Upload new image" style={{display:'inline-block'}}>
                      <input className={styles.imgUploadInput} type="file" accept="image/*" onChange={async (ev)=>{
                        const file = ev.target.files?.[0]
                        if (!file) return
                        setUploadingId(p.id)
                        try {
                          const fd = new FormData()
                          fd.append('file', file)
                          fd.append('slug', p.slug || `project-${p.id}`)
                          fd.append('filename', file.name)
                          const upl = await fetch('/api/uploads/direct', { method: 'POST', body: fd })
                          const j = await upl.json()
                          if (!upl.ok) throw new Error(j?.error || 'Upload failed')
                          const url = j.publicUrl || j.key
                          await fetch('/api/admin/projects', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: p.id, image_path: url }) })
                          setItems(prev => prev.map(it => it.id === p.id ? { ...it, image_path: url } : it))
                        } catch (error: unknown) {
                          alert('Upload failed: ' + getErrorMessage(error))
                        } finally { setUploadingId(null) }
                      }} />
                      <button disabled={uploadingId===p.id}>{uploadingId===p.id ? '…' : '↑'}</button>
                    </label>
                    </div>
                  )}
                </div>
                <div>
                  <p dangerouslySetInnerHTML={{ __html: (p.description_sanitized ?? (purify ? purify.sanitize(String(p.description || '')) : String(p.description || ''))) }} />
                  {p.slug ? <p><Link href={`/projects/${p.slug}`}>Read more</Link></p> : null}
                </div>
              </div>
            </Card>
          ))
        )}
      </div>

      {/* Images are intentionally removed from the list view; full images are shown on the project detail (details) page only. */}
    </main>
  )
}
