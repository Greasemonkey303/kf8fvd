"use client"

import React from 'react'
import styles from '../../../app/admin/admin.module.css'
import { buildPublicUrl } from '@/lib/s3'

function IconList() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{marginRight:8}}>
      <rect x="3" y="4" width="18" height="4" rx="1" fill="#60a5fa"/>
      <rect x="3" y="10" width="12" height="4" rx="1" fill="#a78bfa"/>
      <rect x="3" y="16" width="6" height="4" rx="1" fill="#34d399"/>
    </svg>
  )
}

type ProjectItem = { id: number; slug: string; title: string; subtitle?: string; image_path?: string }

export default function ProjectsList({ items, loading }: { items: ProjectItem[]; loading: boolean }) {
  return (
    <div className={styles.panel}>
      <h2 style={{display:'flex', alignItems:'center', gap:8}}><IconList/>Projects</h2>
      {loading ? <p>Loading…</p> : (
        <ul className="stack">
          {items.map(i => (
            <li key={i.id} className="row between">
              <div style={{display:'flex', alignItems:'center', gap:8}}>
                {i.image_path ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={(() => {
                      try {
                        const path = String(i.image_path || '')
                        if (path.indexOf('X-Amz-Algorithm') !== -1 || path.indexOf('minio') !== -1 || path.indexOf('127.0.0.1') !== -1) {
                          try {
                            const u = new URL(path)
                            let p = u.pathname.replace(/^\/+/,'')
                            const bucket = process.env.NEXT_PUBLIC_S3_BUCKET
                            if (bucket && p.startsWith(bucket + '/')) p = p.slice(bucket.length + 1)
                            return buildPublicUrl(p)
                          } catch (e) {
                            return buildPublicUrl(path)
                          }
                        }
                        if (path.startsWith('http') || path.startsWith('/')) return path
                        return buildPublicUrl(path)
                      } catch (e) { return '' }
                    })()}
                    alt={i.title}
                    style={{width:64, height:48, objectFit:'cover', borderRadius:6}}
                  />
                ) : (
                  <div style={{width:64, height:48, background:'rgba(255,255,255,0.03)', borderRadius:6}} />
                )}
                <div>
                  <strong style={{display:'flex', alignItems:'center', gap:8}}>{i.title} <small className="muted-small">{i.subtitle}</small></strong>
                </div>
              </div>
              <div className="flex gap-2">
                <a className={styles.btnGhost} href={`/admin/projects/${i.id}`} style={{display:'inline-flex', alignItems:'center', gap:8}}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M3 21v-3.75L16.81 3.44a1.5 1.5 0 0 1 2.12 0l1.64 1.64a1.5 1.5 0 0 1 0 2.12L6.75 21H3z" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  Edit
                </a>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
