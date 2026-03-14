"use client"

import styles from '../../../app/admin/admin.module.css'
import { buildPublicUrl } from '@/lib/s3'
import Image from 'next/image'

function IconList() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{marginRight:8}}>
      <rect x="3" y="4" width="18" height="4" rx="1" fill="#60a5fa"/>
      <rect x="3" y="10" width="12" height="4" rx="1" fill="#a78bfa"/>
      <rect x="3" y="16" width="6" height="4" rx="1" fill="var(--logo-green)"/>
    </svg>
  )
}

type ProjectItem = { id: number | string; slug: string; title: string; subtitle?: string; image_path?: string; editLink?: string; is_published?: number }

type Props = {
  items: ProjectItem[]
  loading: boolean
  title?: string
  editPathPrefix?: string
  showReorder?: boolean
  onMoveUp?: (index: number) => void
  onMoveDown?: (index: number) => void
  selectable?: boolean
  selectedIds?: (string|number)[]
  onSelectionChange?: (ids: (string|number)[]) => void
}

function getImageSrc(pathIn?: string) {
  const path = String(pathIn || '')
  try {
    if (path.indexOf('X-Amz-Algorithm') !== -1 || path.indexOf('minio') !== -1 || path.indexOf('127.0.0.1') !== -1) {
      try {
        const u = new URL(path)
        let p = u.pathname.replace(/^\/+/, '')
        const bucket = process.env.NEXT_PUBLIC_S3_BUCKET
        if (bucket && p.startsWith(bucket + '/')) p = p.slice(bucket.length + 1)
        return buildPublicUrl(p)
      } catch (e) {
        return buildPublicUrl(path)
      }
    }
    if (path.startsWith('http') || path.startsWith('/')) return path
    return buildPublicUrl(path)
  } catch (e) {
    return path
  }
}

export default function ProjectsList({ items, loading, title, editPathPrefix, showReorder, onMoveUp, onMoveDown, selectable, selectedIds, onSelectionChange }: Props) {
  const allSelected = selectable && Array.isArray(selectedIds) && items.length > 0 && items.every(i => selectedIds!.some(s => String(s) === String(i.id)))

  function toggleAll() {
    if (!onSelectionChange) return
    if (allSelected) {
      onSelectionChange([])
    } else {
      onSelectionChange(items.map(i => i.id))
    }
  }

  return (
    <div className={styles.panel}>
      <h2 style={{display:'flex', alignItems:'center', gap:8}}><IconList/>{title || 'Projects'}</h2>
      {loading ? <p>Loading…</p> : (
        <ul className="stack">
          {selectable ? (
            <li key="_select_all" className="row between">
              <div style={{display:'flex', alignItems:'center', gap:8}}>
                <label className={styles.checkboxWrap}>
                  <input className={styles.checkboxInput} type="checkbox" checked={!!allSelected} onChange={toggleAll} />
                  <span className={styles.checkboxBox} aria-hidden>
                    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  </span>
                </label>
                <strong>Select all</strong>
              </div>
              <div />
            </li>
          ) : null}

          {items.map((i, idx) => (
            <li key={String(i.id)} className="row between">
              <div style={{display:'flex', alignItems:'center', gap:8}}>
                {selectable ? (
                  <label className={styles.checkboxWrap}>
                    <input
                      className={styles.checkboxInput}
                      type="checkbox"
                      checked={!!(Array.isArray(selectedIds) && selectedIds.some(s => String(s) === String(i.id)))}
                      onChange={(e) => {
                        if (!onSelectionChange) return
                        const checked = e.currentTarget.checked
                        const isChecked = Array.isArray(selectedIds) && selectedIds.some(s => String(s) === String(i.id))
                        const next = checked ? ([...(selectedIds || []), i.id]) : ((selectedIds || []).filter(s => String(s) !== String(i.id)))
                        // dedupe
                        const dedup = Array.from(new Set(next.map(s => String(s)))).map(s => {
                          // try to keep original type if present
                          const orig = (selectedIds || []).find(x => String(x) === s)
                          return orig !== undefined ? orig : s
                        })
                        onSelectionChange(dedup)
                      }}
                    />
                    <span className={styles.checkboxBox} aria-hidden>
                      <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    </span>
                  </label>
                ) : null}

                {i.image_path ? (
                  <Image src={getImageSrc(i.image_path) as string} width={64} height={48} style={{objectFit:'cover', borderRadius:6}} alt="" unoptimized />
                ) : (
                  <div style={{width:64, height:48, background:'rgba(255,255,255,0.03)', borderRadius:6}} />
                )}

                <div>
                  <strong>{i.title}</strong>
                  <div>
                    <small className="muted-small">{i.subtitle}</small>
                  </div>
                </div>

                {(i as any).is_published === 1 ? <span className={styles.statusBadge}>Published</span> : <span className={styles.statusBadgeDraft}>Draft</span>}
              </div>

              <div className="flex gap-2">
                {showReorder ? (
                  <>
                    <button type="button" className={styles.btnGhost} onClick={() => onMoveUp && onMoveUp(idx)} disabled={!onMoveUp || idx === 0} title="Move up">▲</button>
                    <button type="button" className={styles.btnGhost} onClick={() => onMoveDown && onMoveDown(idx)} disabled={!onMoveDown || idx === items.length - 1} title="Move down">▼</button>
                  </>
                ) : null}

                <a className={styles.btnGhost} href={i.editLink || `${editPathPrefix || '/admin/projects'}/${i.id}`} style={{display:'inline-flex', alignItems:'center', gap:8}}>
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

