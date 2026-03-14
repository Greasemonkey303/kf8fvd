"use client"

import React, { useState } from 'react'
import Link from 'next/link'
import styles from '@/app/admin/admin.module.css'
import { useToast } from '@/components/toast/ToastProvider'

const MAX_UPLOAD_SIZE = 5 * 1024 * 1024 // 5 MB

export default function CalllogUploader() {
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [result, setResult] = useState<{ inserted?: number; skipped?: number; totalParsed?: number } | null>(null)
  const [replaceAll, setReplaceAll] = useState(false)
  const toast = useToast()

  async function doUpload(e?: React.FormEvent) {
    if (e) e.preventDefault()
    if (!file) { setMessage('Select a .adi file'); return }
    setUploading(true)
    setMessage(null)
    setResult(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      if (replaceAll) fd.append('replace', '1')

      const res = await fetch('/api/admin/calllog', { method: 'POST', body: fd })
      let j: unknown = null
      try { j = await res.json() } catch (_) { j = null }

      const getNum = (obj: unknown, key: string) => {
        if (!obj || typeof obj !== 'object') return 0
        const v = (obj as Record<string, unknown>)[key]
        if (typeof v === 'number') return v
        if (typeof v === 'string') return Number(v) || 0
        return 0
      }
      const getStr = (obj: unknown, key: string) => {
        if (!obj || typeof obj !== 'object') return ''
        const v = (obj as Record<string, unknown>)[key]
        return typeof v === 'string' ? v : String(v || '')
      }

      if (!res.ok) {
        const errMsg = getStr(j, 'error') || res.statusText || 'unknown'
        setMessage('Upload failed: ' + errMsg)
        toast?.showToast('Upload failed: ' + errMsg, 'error')
        setResult(null)
      } else {
        setResult({ inserted: getNum(j, 'inserted'), skipped: getNum(j, 'skipped'), totalParsed: getNum(j, 'totalParsed') })
        setMessage('Upload complete')
        toast?.showToast(`Upload complete — inserted ${getNum(j, 'inserted')}, skipped ${getNum(j, 'skipped')}`, 'success')
      }
    } catch (err) {
      const em = err instanceof Error ? err.message : String(err)
      setMessage('Upload error: ' + em)
      toast?.showToast('Upload error: ' + em, 'error')
      setResult(null)
    } finally {
      setUploading(false)
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] || null
    if (!f) { setFile(null); return }
    if (!/\.adi$/i.test(f.name)) {
      toast?.showToast('Only .adi files are allowed', 'error')
      setFile(null)
      return
    }
    if (f.size && f.size > MAX_UPLOAD_SIZE) {
      toast?.showToast(`File too large (max ${Math.round(MAX_UPLOAD_SIZE/1024)} KB)`, 'error')
      setFile(null)
      return
    }
    setFile(f)
  }

  function handleReplaceChange(e: React.ChangeEvent<HTMLInputElement>) {
    const checked = e.target.checked
    if (checked) {
      const ans = typeof window !== 'undefined' ? window.prompt('Type REPLACE to confirm deleting existing call log entries. This cannot be undone.') : null
      if (ans !== 'REPLACE') {
        toast?.showToast('Replace cancelled', 'info')
        return
      }
      toast?.showToast('Replace confirmed', 'info')
      setReplaceAll(true)
    } else {
      setReplaceAll(false)
    }
  }

  return (
    <div className={styles.adminSectionCard} style={{ marginBottom: 12 }}>
      <div className={styles.adminTop}>
        <div className="title">Call Log (ADIF)</div>
        <div className={styles.topActions}>
          <Link href="/admin/utilities/call-log" className={styles.btnGhost}>Manage</Link>
        </div>
      </div>

      <form onSubmit={doUpload} className={styles.panel}>
        <div style={{display:'flex', gap:12, alignItems:'center', flexWrap:'wrap'}}>
          <label className={styles.btnGhost + ' ' + styles.btnGhostSmall} style={{display:'inline-flex', alignItems:'center', gap:8, cursor:'pointer'}}>
            <input type="file" accept=".adi,text/plain" onChange={handleFileChange} style={{display:'none'}} />
            {file ? file.name : 'Choose .adi file'}
          </label>

          <label className={`${styles.checkboxWrap} ${styles.smallMuted}`} style={{display:'inline-flex', alignItems:'center'}}>
            <input type="checkbox" className={styles.checkboxInput} checked={replaceAll} onChange={handleReplaceChange} />
            <span className={styles.checkboxBox} aria-hidden>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </span>
            <span style={{marginLeft:6}}>Replace existing dataset</span>
          </label>

          <button className={styles.brandButton} type="submit" disabled={uploading}>
            {uploading && <span className={styles.spinner} style={{ width: 16, height: 16, marginRight: 8 }} aria-hidden />}
            {uploading ? 'Uploading…' : 'Upload'}
          </button>

          <button type="button" className={styles.btnGhost} onClick={()=>{ setFile(null); setMessage(null); setResult(null) }} disabled={uploading}>Clear</button>
        </div>

        {file && <div style={{marginTop:8}} className={styles.smallMuted}><strong>Selected:</strong> {file.name} ({Math.round((file.size||0)/1024)} KB)</div>}
        {message && <div style={{marginTop:8}} className={styles.smallMuted}>{message}</div>}

        {result && (
          <div style={{marginTop:12}} className={styles.uploadInfoRow} role="status" aria-live="polite">
            <div style={{display:'flex', gap:12, alignItems:'center'}}>
              <span className={styles.statusBadge}>✓ Upload complete</span>
              <span className={styles.smallMuted}><strong>Inserted:</strong> {result.inserted}</span>
              <span className={styles.smallMuted}><strong>Skipped:</strong> {result.skipped}</span>
              <span className={styles.smallMuted}><strong>Parsed:</strong> {result.totalParsed}</span>
            </div>
            <div>
              <button className={styles.brandButton} onClick={()=> window.location.reload()}>Refresh rows</button>
              <Link href="/admin/utilities/call-log" className={styles.btnGhost} style={{marginLeft:8}}>View Call Log</Link>
            </div>
          </div>
        )}
      </form>
    </div>
  )
}
