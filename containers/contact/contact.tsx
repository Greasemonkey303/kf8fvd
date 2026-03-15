"use client"

import React, { useEffect, useRef, useState } from 'react'
import { tlog } from '@/lib/turnstileDebug'
import { loadTurnstileScript, waitForTurnstileReady } from '@/lib/turnstileLoader'
import Modal from '@/components/modal/Modal'
import Image from 'next/image'
import styles from './contact.module.css'
import { Card } from '@/components'

function isValidEmail(email: string){
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

export default function Contact() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [errors, setErrors] = useState<Record<string,string>>({})
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [confirmError, setConfirmError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const successRef = useRef<HTMLDivElement | null>(null)
  const globalErrorRef = useRef<HTMLDivElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const nameRef = useRef<HTMLInputElement | null>(null)
  const emailRef = useRef<HTMLInputElement | null>(null)
  const messageRef = useRef<HTMLTextAreaElement | null>(null)
  const submitButtonRef = useRef<HTMLButtonElement | null>(null)
  const progressInnerRef = useRef<HTMLDivElement | null>(null)
  const xhrRef = useRef<XMLHttpRequest | null>(null)
  const confirmCancelRef = useRef<HTMLButtonElement | null>(null)
  const [mounted, setMounted] = useState(false)
  const [totalSize, setTotalSize] = useState(0)
  const [cfWidgetId, setCfWidgetId] = useState<number | null>(null)
  const [cfToken, setCfToken] = useState<string | null>(null)
  const cfIntervalRef = useRef<number | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [previewSrc, setPreviewSrc] = useState<string | null>(null)
  const [previewName, setPreviewName] = useState<string | null>(null)
  const [uploadProgress, setUploadProgress] = useState<number | null>(null)

  useEffect(()=>{
    if (success) {
      const t = setTimeout(()=> setSuccess(false), 3500)
      return ()=> clearTimeout(t)
    }
  },[success])

  useEffect(()=>{
    setMounted(true)
    // dynamically load Cloudflare Turnstile script if sitekey is present
    tlog('contact useEffect mount', { sitekeyPresent: !!process.env.NEXT_PUBLIC_CF_TURNSTILE_SITEKEY })
    if (process.env.NEXT_PUBLIC_CF_TURNSTILE_SITEKEY) {
      loadTurnstileScript().then(() => tlog('contact script loaded')).catch(e => tlog('contact script load error', e))
    }
  },[])

  // When script loads, render turnstile widget programmatically and capture token via callback
  useEffect(()=>{
    const sitekey = process.env.NEXT_PUBLIC_CF_TURNSTILE_SITEKEY
    tlog('contact render effect start', { sitekeyPresent: !!sitekey })
    if (!sitekey) return
    let cancelled = false
    ;(async ()=>{
      try {
        await loadTurnstileScript().catch(e=> { tlog('contact load script failed', e); throw e })
        tlog('contact script loaded, waiting for ready')
        await waitForTurnstileReady(8000).catch(e=> { tlog('contact wait ready failed', e); throw e })
        if (cancelled) return
        const container = document.getElementById('cf-turnstile-container')
        if (!container) { tlog('contact: container missing after ready'); return }
        try {
          type Turnstile = { render?: (el: HTMLElement, opts: { sitekey?: string; callback?: (token: string)=>void }) => unknown; reset?: (id: number) => void }
          const win = window as unknown as Window & { turnstile?: Turnstile }
          const id = win.turnstile && typeof win.turnstile.render === 'function' ? win.turnstile.render(container, { sitekey, callback: (token: string) => setCfToken(token) }) : undefined
          setCfWidgetId(typeof id === 'number' ? id : null)
          ;(container as HTMLElement).dataset.turnstileRendered = '1'
          tlog('contact render success', { id })
        } catch (err) {
          tlog('contact render error', err)
        }
      } catch (err) {
        tlog('contact loader error', err)
      }
    })()
    return () => { cancelled = true }
  },[])

  function validate(){
    const e: Record<string,string> = {}
    if (!name.trim()) e.name = 'Please enter your name.'
    if (!email.trim()) e.email = 'Please enter your email.'
    else if (!isValidEmail(email.trim())) e.email = 'Please enter a valid email address.'
    if (!message.trim() || message.trim().length < 10) e.message = 'Please enter a message (10+ characters).'
    // file size limits (5MB each)
    const MAX_FILE = 50 * 1024 * 1024 // 50MB per file
    for (let i=0;i<files.length;i++){
      const f = files[i]
      if (f.size > MAX_FILE) { e.files = 'Each attachment must be 50MB or smaller.'; break }
    }
    setErrors(e)
    // if there are errors, focus the first invalid field for accessibility
    const first = Object.keys(e)[0]
    if (first) {
      if (first === 'name' && nameRef.current) nameRef.current.focus()
      else if (first === 'email' && emailRef.current) emailRef.current.focus()
      else if (first === 'message' && messageRef.current) messageRef.current.focus()
    }
    return Object.keys(e).length === 0
  }

  function validateField(field: 'name'|'email'|'message'){
    setErrors(prev => {
      const e = { ...prev }
      if (field === 'name') {
        if (!name.trim()) e.name = 'Please enter your name.'
        else delete e.name
      }
      if (field === 'email') {
        if (!email.trim()) e.email = 'Please enter your email.'
        else if (!isValidEmail(email.trim())) e.email = 'Please enter a valid email address.'
        else delete e.email
      }
      if (field === 'message') {
        if (!message.trim() || message.trim().length < 10) e.message = 'Please enter a message (10+ characters).'
        else delete e.message
      }
      return e
    })
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>){
    const list = e.target.files
    if (!list) return
    const arr = Array.from(list)
    // limit total attachments to 6
    const merged = [...files, ...arr].slice(0,6)
    setFiles(merged)
    setTotalSize(merged.reduce((s,f)=> s + f.size, 0))
    setErrors(prev => { const e = { ...prev }; delete e.files; return e })
    // reset input to allow re-adding same file
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    const dt = e.dataTransfer
    if (!dt) return
    const arr = Array.from(dt.files || [])
    if (arr.length === 0) return
    const merged = [...files, ...arr].slice(0,6)
    setFiles(merged)
    setTotalSize(merged.reduce((s,f)=> s + f.size, 0))
    setErrors(prev => { const e = { ...prev }; delete e.files; return e })
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(true)
  }

  function openPreview(file: File) {
    if (!file.type.startsWith('image/')) return
    setPreviewSrc(URL.createObjectURL(file))
    setPreviewName(file.name)
  }

  function closePreview() {
    if (previewSrc) URL.revokeObjectURL(previewSrc)
    setPreviewSrc(null)
    setPreviewName(null)
  }

  function removeFile(idx: number){ setFiles(files.filter((_,i)=> i!==idx)) }

  function handleSubmit(e: React.FormEvent){
    e.preventDefault()
    if (loading || uploadProgress !== null) return
    if (!validate()) return
    setConfirmOpen(true)
  }

  async function confirmSend(){
    setConfirmError(null)
    setLoading(true)
    try {
      // small analytics/log
      console.log('[analytics] contact.submit')
      const fd = new FormData()
      fd.append('name', name)
      fd.append('email', email)
      fd.append('message', message)
      // include honeypot value if present in DOM
      const hpEl = document.querySelector<HTMLInputElement>('input[name="hp"]')
      if (hpEl) fd.append('hp', hpEl.value)
      // include Cloudflare Turnstile token if present (use programmatic token if available)
      if (process.env.NEXT_PUBLIC_CF_TURNSTILE_SITEKEY) {
        const token = cfToken || document.querySelector<HTMLInputElement>('input[name="cf-turnstile-response"]')?.value
        if (!token) {
          throw new Error('Please complete the CAPTCHA to continue')
        }
        fd.append('cf-turnstile-response', token)
      }
      files.forEach((f, i) => fd.append(`file-${i}`, f))

      // use XMLHttpRequest to track upload progress for attachments
      const xhr = new XMLHttpRequest()
      xhrRef.current = xhr
      await new Promise<void>((resolve, reject) => {
        xhr.open('POST', '/api/contact')
        xhr.onload = () => {
          xhrRef.current = null
          try {
            const raw = xhr.responseText || ''
            let parsed: unknown
            try { parsed = raw ? JSON.parse(raw) : undefined } catch { parsed = undefined }
            const parsedObj = parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : undefined
            if (xhr.status < 200 || xhr.status >= 300) {
              console.error('API /api/contact error', { status: xhr.status, responseText: raw, parsed: parsedObj })
              const errMsg = parsedObj && typeof parsedObj.details === 'string'
                ? parsedObj.details
                : parsedObj && typeof parsedObj.error === 'string'
                  ? parsedObj.error
                  : parsedObj && parsedObj.error && typeof (parsedObj.error as Record<string, unknown>).message === 'string'
                    ? (parsedObj.error as Record<string, unknown>).message
                    : raw || 'Send failed'
              return reject(new Error(String(errMsg)))
            }
            resolve()
          } catch (err) { reject(err instanceof Error ? err : new Error(String(err))) }
        }
        xhr.onerror = () => { xhrRef.current = null; reject(new Error('Network error')) }
        xhr.onabort = () => { xhrRef.current = null; reject(new Error('Upload canceled')) }
        if (xhr.upload) {
          xhr.upload.onprogress = (ev) => {
            if (ev.lengthComputable) setUploadProgress(Math.round((ev.loaded / ev.total) * 100))
          }
        }
        xhr.send(fd)
      })
      setUploadProgress(null)
      // reset turnstile widget to avoid reusing token
      try {
        const win = window as unknown as Window & { turnstile?: { reset?: (id:number)=>void } }
        if (win.turnstile && cfWidgetId != null && typeof win.turnstile.reset === 'function') win.turnstile.reset(cfWidgetId)
        setCfToken(null)
      } catch {}

      setSuccess(true)
      // clear form
      setName(''); setEmail(''); setMessage(''); setFiles([])
      // close the confirm modal on success
      setConfirmOpen(false)
    } catch (err) {
      console.error('contact send error', err)
      const msg = err instanceof Error ? err.message : String(err || 'Send failed')
      setConfirmError(msg)
      setErrors(prev => ({ ...prev, _global: msg }))
    } finally {
      setLoading(false)
      xhrRef.current = null
    }
  }

  function cancelUpload(){
    try { if (xhrRef.current) xhrRef.current.abort() } catch {}
    xhrRef.current = null
    setUploadProgress(null)
    setLoading(false)
    setErrors(prev => ({ ...prev, _global: 'Upload canceled' }))
    setConfirmOpen(false)
  }

  useEffect(() => {
    if (success) {
      // focus toast for screen reader users and keyboard users
      try { if (successRef.current) successRef.current.focus() } catch {}
      const t = setTimeout(()=> setSuccess(false), 3500)
      return ()=> clearTimeout(t)
    }
  }, [success])

  

  // Escape key closes preview or confirm modal
  useEffect(()=>{
    function onKey(e: KeyboardEvent){
      if (e.key === 'Escape'){
        if (previewSrc) closePreview()
        if (confirmOpen) setConfirmOpen(false)
      }
    }
    if (previewSrc || confirmOpen) {
      window.addEventListener('keydown', onKey)
      return () => window.removeEventListener('keydown', onKey)
    }
  },[previewSrc, confirmOpen])


  // focus global error when present
  useEffect(()=>{
    if (errors._global && globalErrorRef.current) {
      try { globalErrorRef.current.focus() } catch {}
    }
  },[errors._global])
  return (
    <main className={styles.contact}>
      <div className={styles.wrapper}>
        <Card title="Contact" subtitle="Get in touch">
          <div className={styles.inner}>
            {mounted ? (
              <form className={styles.form} onSubmit={handleSubmit} noValidate>
                <h3 className={styles.formHeading}>Message me now</h3>
              {errors._global && <div ref={globalErrorRef} tabIndex={-1} className={styles.formError} role="alert" aria-live="assertive">{errors._global}</div>}

              <div>
                <label htmlFor="contact-name">Name</label>
                <input id="contact-name" ref={nameRef} aria-label="Name" aria-invalid={!!errors.name} aria-describedby={errors.name? 'err-name':''} value={name} onChange={(e)=> { setName(e.target.value); setErrors(prev => { const e = { ...prev }; delete e.name; return e }) }} placeholder="Your name" required autoComplete="name" onBlur={()=> validateField('name')} />
                {errors.name && <div id="err-name" className={styles.formError} role="alert">{errors.name}</div>}
              </div>

              <div>
                <label htmlFor="contact-email">Email</label>
                <input id="contact-email" ref={emailRef} aria-label="Email" type="email" aria-invalid={!!errors.email} aria-describedby={errors.email? 'err-email':''} value={email} onChange={(e)=> { setEmail(e.target.value); setErrors(prev => { const e = { ...prev }; delete e.email; return e }) }} placeholder="you@example.com" required autoComplete="email" onBlur={()=> validateField('email')} />
                {errors.email && <div id="err-email" className={styles.formError} role="alert">{errors.email}</div>}
              </div>

              <div>
                <label htmlFor="contact-message">Message</label>
                <textarea id="contact-message" ref={messageRef} aria-label="Message" aria-invalid={!!errors.message} aria-describedby={errors.message? 'err-message':''} value={message} onChange={(e)=> { setMessage(e.target.value); setErrors(prev => { const e = { ...prev }; delete e.message; return e }) }} placeholder="Message" required onBlur={()=> validateField('message')} />
                {errors.message && <div id="err-message" className={styles.formError} role="alert">{errors.message}</div>}
              </div>

              <label className={`${styles.fileLabel} ${dragOver? styles.dropZone : ''}`} onDrop={handleDrop} onDragOver={handleDragOver} onDragLeave={()=> setDragOver(false)}>
                Attachments
                <div className={styles.fileControls}>
                  <button type="button" className={styles.chooseBtn} onClick={()=> fileInputRef.current?.click()}>Choose files</button>
                  <span className={styles.fileHint}>or drag & drop here</span>
                  <input id="file-input" ref={fileInputRef} type="file" accept="image/*,application/pdf,.txt,.doc,.docx" multiple onChange={handleFileChange} className="hidden-input" />
                </div>
                {errors.files && <div className={styles.formError} role="alert">{errors.files}</div>}
                {files.length>0 && (
                  <div className={styles.fileList}>
                    {files.map((f,i)=> (
                      <div key={i} className={styles.fileItem}>
                        {f.type.startsWith('image/') && (
                          <Image onClick={()=> openPreview(f)} src={URL.createObjectURL(f)} alt={f.name} className={styles.fileThumb} width={96} height={72} unoptimized style={{cursor:'pointer'}} />
                        )}
                        <div className={styles.fileMeta}>
                          <div className={styles.fileName}>{f.name}</div>
                          <div className={styles.fileSize}>{Math.round(f.size/1024)} KB</div>
                        </div>
                        <button type="button" className={styles.removeFile} onClick={()=> removeFile(i)} aria-label={`Remove ${f.name}`}>Remove</button>
                      </div>
                    ))}
                  </div>
                )}
              </label>
              
              <div className={styles.sizeInfo} aria-live="polite">
                {totalSize>0 && `Total attachments: ${Math.round(totalSize/1024/1024*10)/10} MB`}
                {totalSize > 50 * 1024 * 1024 ? (
                  <span className={styles.formError}> — total exceeds 50MB limit</span>
                ) : totalSize > 25 * 1024 * 1024 ? (
                  <span className={styles.small}> — approaching 50MB limit</span>
                ) : null}
              </div>

              {/* Honeypot field (hidden) */}
              <div className="sr-offscreen" aria-hidden>
                <label>Leave this field empty<input name="hp" tabIndex={-1} /></label>
              </div>

              {/* Cloudflare Turnstile widget (requires NEXT_PUBLIC_CF_TURNSTILE_SITEKEY in env) */}
              {process.env.NEXT_PUBLIC_CF_TURNSTILE_SITEKEY && (
                <div className="mt-12">
                  <div id="cf-turnstile-container"></div>
                  {!cfToken && <div className={styles.small} role="status" aria-live="polite">Please complete the CAPTCHA to enable sending.</div>}
                </div>
              )}

                <div className={styles.actions}>
                  <button ref={submitButtonRef} type="submit" disabled={loading || uploadProgress !== null || (Boolean(process.env.NEXT_PUBLIC_CF_TURNSTILE_SITEKEY) && !cfToken)} aria-busy={loading}>
                    {loading ? (
                      <>
                        <span className={styles.spinner} aria-hidden></span>
                        <span style={{marginLeft:8}}>Sending…</span>
                      </>
                    ) : 'Send'}
                  </button>
                </div>
              </form>
            ) : (
              <div className={styles.formPlaceholder} aria-hidden>Loading form…</div>
            )}

            <div className={styles.contactInfo}>
              <h3 className={styles.contactHeading}>Email me directly</h3>
              <a className={styles.mailto} href="mailto:zach@kf8fvd.com">✉️ zach@kf8fvd.com</a>
            </div>
          </div>
        </Card>
      </div>

      {confirmOpen && (
        <Modal overlayClassName={styles.confirmOverlay} contentClassName={styles.confirmModal} onClose={() => setConfirmOpen(false)} initialFocusRef={confirmCancelRef as unknown as React.RefObject<HTMLElement>} titleId="confirm-title" descriptionId="confirm-desc">
          <h4 id="confirm-title">Confirm message</h4>
          <p><strong>Name:</strong> {name || '—'}</p>
          <p><strong>Email:</strong> {email || '—'}</p>
          <p><strong>Message:</strong></p>
          <div id="confirm-desc" className={styles.preview}>{message || '—'}</div>
          {files.length>0 && <p><strong>Attachments:</strong> {files.map(f=> f.name).join(', ')}</p>}
          {confirmError && <div className={styles.formError} role="alert">{confirmError}</div>}

          {uploadProgress !== null && (
            <>
              <div className={styles.progress} aria-hidden>
                <div className={styles.progressInner} style={{ width: `${uploadProgress}%` }} aria-valuenow={uploadProgress} aria-valuemin={0} aria-valuemax={100} />
              </div>
              <div className={styles.progressInfo}>
                <span className={styles.progressText}>{uploadProgress}%</span>
                <button type="button" onClick={() => { cancelUpload() }} className={styles.cancelUpload}>Cancel</button>
              </div>
            </>
          )}

          <div className={styles.confirmActions}>
            <button ref={confirmCancelRef} onClick={() => { if (uploadProgress !== null) cancelUpload(); else setConfirmOpen(false) }}>Cancel</button>
            <button onClick={confirmSend} disabled={loading || uploadProgress !== null || (Boolean(process.env.NEXT_PUBLIC_CF_TURNSTILE_SITEKEY) && !cfToken)} aria-disabled={loading || uploadProgress !== null}>{loading ? 'Sending…' : 'Confirm & Send'}</button>
          </div>
        </Modal>
      )}

              {previewSrc && (
        <Modal overlayClassName={styles.modalOverlay} contentClassName={styles.modal} onClose={closePreview} titleId="preview-title">
          <h4 id="preview-title">{previewName}</h4>
          <Image src={previewSrc as string} alt={previewName || 'preview'} className={styles.previewImg} width={800} height={600} unoptimized />
          <div className="flex justify-end mt-8">
              <button onClick={closePreview}>Close</button>
          </div>
        </Modal>
        )}

        {uploadProgress !== null && (
          <div className="progress-fixed" role="status" aria-live="polite" aria-atomic="true">
            <div className={styles.progress} aria-hidden={false}>
              <div ref={progressInnerRef} className={styles.progressInner} style={{ width: `${uploadProgress}%` }} aria-valuenow={uploadProgress} aria-valuemin={0} aria-valuemax={100} />
            </div>
            <div className={styles.progressInfo}>
              <span className={styles.progressText}>{uploadProgress}%</span>
              <button type="button" onClick={cancelUpload} className={styles.cancelUpload}>Cancel</button>
            </div>
          </div>
        )}

      {success && (
        <div ref={successRef} tabIndex={-1} className={styles.toast} role="status" aria-live="polite">Message sent — thanks! I'll reply as soon as I can.</div>
      )}
    </main>
  )
}
