"use client"

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { tlog } from '@/lib/turnstileDebug'
import { loadTurnstileScript, waitForTurnstileReady, fetchTurnstileSiteKey } from '@/lib/turnstileLoader'
import Modal from '@/components/modal/Modal'
import Image from 'next/image'
import styles from './contact.module.css'
import { Card } from '@/components'

function isValidEmail(email: string){
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

export default function Contact() {
  const quickTopics = [
    'General ham radio questions',
    'Hotspot or digital mode setup help',
    'Project follow-up and parts used',
    'Station, repeater, antenna, or software discussion',
  ]
  const responseSteps = [
    'Use the form for project questions, station notes, or operating follow-up.',
    'Add attachments only when they help explain the issue or build.',
    'After sending, the page confirms what was submitted and resets the form cleanly.',
  ]

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
  const [cfWidgetId, setCfWidgetId] = useState<string | number | null>(null)
  const [cfToken, setCfToken] = useState<string | null>(null)
  const [runtimeSiteKey, setRuntimeSiteKey] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [previewSrc, setPreviewSrc] = useState<string | null>(null)
  const [previewName, setPreviewName] = useState<string | null>(null)
  const [uploadProgress, setUploadProgress] = useState<number | null>(null)
  const filePreviews = useMemo(() => files.map((file) => ({ file, previewUrl: file.type.startsWith('image/') ? URL.createObjectURL(file) : null })), [files])

  useEffect(() => {
    return () => {
      filePreviews.forEach(({ previewUrl }) => {
        if (previewUrl) URL.revokeObjectURL(previewUrl)
      })
    }
  }, [filePreviews])

  useEffect(()=>{
    if (success) {
      const t = setTimeout(()=> setSuccess(false), 3500)
      return ()=> clearTimeout(t)
    }
  },[success])

  useEffect(()=>{
    setMounted(true)
    // dynamically load Cloudflare Turnstile script if sitekey is present (build-time or runtime)
    const envSiteKey = process.env.NEXT_PUBLIC_CF_TURNSTILE_SITEKEY
    tlog('contact useEffect mount', { sitekeyPresent: !!envSiteKey })
    if (envSiteKey) {
      loadTurnstileScript().then(() => tlog('contact script loaded')).catch(e => tlog('contact script load error', e))
      return
    }
    // fetch runtime sitekey if available
    fetchTurnstileSiteKey().then(k => {
      if (k) {
        setRuntimeSiteKey(k)
        loadTurnstileScript().then(() => tlog('contact script loaded (runtime)')).catch(e => tlog('contact script load error', e))
      }
    }).catch(e => tlog('contact fetch runtime key failed', e))
  },[])

  const clearTurnstileToken = useCallback(() => {
    setCfToken(null)
    try {
      const input = document.querySelector<HTMLInputElement>('input[name="cf-turnstile-response"]')
      if (input) input.value = ''
    } catch (e) { void e }
  }, [])

  const resetTurnstileWidget = useCallback(() => {
    clearTurnstileToken()
    try {
      type TurnstileReset = { reset?: (id: string | number) => void }
      const win = window as unknown as Window & { turnstile?: TurnstileReset }
      if (win.turnstile && cfWidgetId != null && typeof win.turnstile.reset === 'function') {
        win.turnstile.reset(cfWidgetId)
      }
    } catch (e) { void e }
  }, [cfWidgetId, clearTurnstileToken])

  // When script loads, render turnstile widget programmatically and capture token via callback
  useEffect(()=>{
    const sitekey = process.env.NEXT_PUBLIC_CF_TURNSTILE_SITEKEY || runtimeSiteKey
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
        // If a widget was already rendered into this container, skip rendering again.
        try {
          const rendered = (container as HTMLElement).dataset.turnstileRendered
          if (rendered === '1') { tlog('contact: container already rendered, skipping'); return }
        } catch (e) { void e }
        try {
          type Turnstile = {
            render?: (el: HTMLElement, opts: {
              sitekey?: string
              callback?: (token: string)=>void
              'error-callback'?: () => void
              'expired-callback'?: () => void
              'timeout-callback'?: () => void
            }) => unknown
            reset?: (id: string | number) => void
          }
          const win = window as unknown as Window & { turnstile?: Turnstile }
          const id = win.turnstile && typeof win.turnstile.render === 'function' ? win.turnstile.render(container, {
            sitekey,
            callback: (token: string) => {
              setCfToken(token)
              try {
                const input = document.querySelector<HTMLInputElement>('input[name="cf-turnstile-response"]')
                if (input) input.value = token
              } catch (e) { void e }
            },
            'error-callback': () => {
              clearTurnstileToken()
              window.setTimeout(() => resetTurnstileWidget(), 250)
            },
            'expired-callback': () => {
              clearTurnstileToken()
              window.setTimeout(() => resetTurnstileWidget(), 250)
            },
            'timeout-callback': () => {
              clearTurnstileToken()
              window.setTimeout(() => resetTurnstileWidget(), 250)
            },
          }) : undefined
          setCfWidgetId(typeof id === 'string' || typeof id === 'number' ? id : null)
          ;(container as HTMLElement).dataset.turnstileRendered = '1'
          tlog('contact render success', { id })
        } catch (err) {
          tlog('contact render error', err)
        }
      } catch (err) {
        tlog('contact loader error', err)
      }
    })()
    return () => {
      cancelled = true
      clearTurnstileToken()
    }
  }, [runtimeSiteKey, clearTurnstileToken, resetTurnstileWidget])

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

  const closePreview = useCallback(() => {
    if (previewSrc) URL.revokeObjectURL(previewSrc)
    setPreviewSrc(null)
    setPreviewName(null)
  }, [previewSrc])

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
      const fd = new FormData()
      fd.append('name', name)
      fd.append('email', email)
      fd.append('message', message)
      // include honeypot value if present in DOM
      const hpEl = document.querySelector<HTMLInputElement>('input[name="hp"]')
      if (hpEl) fd.append('hp', hpEl.value)
      // include Cloudflare Turnstile token if a sitekey is configured (build-time or runtime)
      const sitekeyNow = process.env.NEXT_PUBLIC_CF_TURNSTILE_SITEKEY || runtimeSiteKey
      if (sitekeyNow) {
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
        resetTurnstileWidget()
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
  }, [previewSrc, confirmOpen, closePreview])


  // focus global error when present
  useEffect(()=>{
    if (errors._global && globalErrorRef.current) {
      try { globalErrorRef.current.focus() } catch {}
    }
  },[errors._global])
  return (
    <main className={styles.contact} aria-labelledby="contact-page-title">
      <div className={styles.wrapper}>
        <div className="page-intro">
          <p className="page-kicker">Contact</p>
          <h1 id="contact-page-title" className="page-heading">Reach out about radio, projects, or station questions</h1>
          <p className="page-deck">Use the form for general questions, QSO follow-up, or project inquiries. Attachments are optional, and direct email is available if you prefer a simpler route.</p>
        </div>
        <Card title="Send a Message" subtitle="Get in touch">
          <div className={styles.inner}>
            {mounted ? (
              <form className={styles.form} onSubmit={handleSubmit} noValidate>
                <h3 className={styles.formHeading}>Message me now</h3>
              <div className={styles.formIntro}>
                <p className={styles.infoText}>This form is set up for radio-related questions first, so the fastest replies usually come when the message includes the gear, mode, or repeater involved.</p>
                <ul className={styles.topicList}>
                  {responseSteps.map((step) => <li key={step}>{step}</li>)}
                </ul>
              </div>
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
                    {filePreviews.map(({ file, previewUrl }, i)=> (
                      <div key={i} className={styles.fileItem}>
                        {previewUrl && (
                          <Image onClick={()=> openPreview(file)} src={previewUrl} alt={file.name} className={styles.fileThumb} width={96} height={72} sizes="96px" unoptimized style={{cursor:'pointer'}} />
                        )}
                        <div className={styles.fileMeta}>
                          <div className={styles.fileName}>{file.name}</div>
                          <div className={styles.fileSize}>{Math.round(file.size/1024)} KB</div>
                        </div>
                        <button type="button" className={styles.removeFile} onClick={()=> removeFile(i)} aria-label={`Remove ${file.name}`}>Remove</button>
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

              <div className={styles.formSummary}>
                <div className={styles.summaryBlock}>
                  <span className={styles.summaryLabel}>Message state</span>
                  <strong className={styles.summaryValue}>{message.trim().length >= 10 ? 'Ready to send' : 'Needs more detail'}</strong>
                </div>
                <div className={styles.summaryBlock}>
                  <span className={styles.summaryLabel}>Attachments</span>
                  <strong className={styles.summaryValue}>{files.length} file{files.length === 1 ? '' : 's'}</strong>
                </div>
                <div className={styles.summaryBlock}>
                  <span className={styles.summaryLabel}>Best fit</span>
                  <strong className={styles.summaryValue}>Ham radio / station help</strong>
                </div>
              </div>

              {/* Honeypot field (hidden) */}
              <div className="sr-offscreen" aria-hidden>
                <label>Leave this field empty<input name="hp" tabIndex={-1} /></label>
              </div>

              {/* Cloudflare Turnstile widget (show when build-time or runtime sitekey present) */}
              {(process.env.NEXT_PUBLIC_CF_TURNSTILE_SITEKEY || runtimeSiteKey) && (
                <div className="mt-12">
                  <div id="cf-turnstile-container"></div>
                  <input type="hidden" name="cf-turnstile-response" />
                  {!cfToken && <div className={styles.small} role="status" aria-live="polite">Please complete the CAPTCHA to enable sending.</div>}
                </div>
              )}

                <div className={styles.actions}>
                  <button ref={submitButtonRef} type="submit" disabled={loading || uploadProgress !== null || ((Boolean(process.env.NEXT_PUBLIC_CF_TURNSTILE_SITEKEY) || Boolean(runtimeSiteKey)) && !cfToken)} aria-busy={loading}>
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
              <div className={styles.infoPanel}>
                <h3 className={styles.contactHeading}>What happens next</h3>
                <p className={styles.infoText}>Messages are meant for actual station, build, and operating follow-up, not a generic inbox. That keeps the page aligned with the rest of the site and makes the contact flow feel more intentional.</p>
              </div>

              <div className={styles.infoPanel}>
                <h3 className={styles.contactHeading}>Email me directly</h3>
                <a className={styles.mailto} href="mailto:zach@kf8fvd.com">✉️ zach@kf8fvd.com</a>
              </div>

              <div className={styles.infoPanel}>
                <h3 className={styles.contactHeading}>Good topics for this page</h3>
                <ul className={styles.topicList}>
                  {quickTopics.map((topic) => <li key={topic}>{topic}</li>)}
                </ul>
              </div>

              <div className={styles.infoPanel}>
                <h3 className={styles.contactHeading}>Before you send</h3>
                <p className={styles.infoText}>If you are asking about a build, include the model, band, mode, or part you are working with. That makes it much easier to answer with something useful.</p>
                <p className={styles.infoText}>If your message is about radio operation, include the repeater, hotspot, software, or equipment involved.</p>
              </div>

              <div className={styles.infoPanel}>
                <h3 className={styles.contactHeading}>Site focus</h3>
                <p className={styles.infoText}>This site is centered on amateur radio, digital voice, station projects, and practical operating notes, so messages in that lane are the best fit here.</p>
              </div>
            </div>
          </div>
        </Card>
      </div>

      {confirmOpen && (
        <Modal overlayClassName={styles.confirmOverlay} contentClassName={styles.confirmModal} onClose={() => setConfirmOpen(false)} initialFocusRef={confirmCancelRef as unknown as React.RefObject<HTMLElement>} titleId="confirm-title" descriptionId="confirm-desc">
          <h4 id="confirm-title">Confirm message</h4>
          <div className={styles.confirmSummaryGrid}>
            <div className={styles.confirmChip}><span>Name</span><strong>{name || '—'}</strong></div>
            <div className={styles.confirmChip}><span>Email</span><strong>{email || '—'}</strong></div>
            <div className={styles.confirmChip}><span>Attachments</span><strong>{files.length}</strong></div>
          </div>
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
            <button onClick={confirmSend} disabled={loading || uploadProgress !== null || ((Boolean(process.env.NEXT_PUBLIC_CF_TURNSTILE_SITEKEY) || Boolean(runtimeSiteKey)) && !cfToken)} aria-disabled={loading || uploadProgress !== null || ((Boolean(process.env.NEXT_PUBLIC_CF_TURNSTILE_SITEKEY) || Boolean(runtimeSiteKey)) && !cfToken)}>{loading ? 'Sending…' : 'Confirm & Send'}</button>
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
        <div ref={successRef} tabIndex={-1} className={styles.toast} role="status" aria-live="polite">Message sent - thanks! I&apos;ll reply as soon as I can.</div>
      )}
    </main>
  )
}
