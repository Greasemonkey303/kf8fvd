"use client"

import React, { useEffect, useRef, useState } from 'react'
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
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const nameRef = useRef<HTMLInputElement | null>(null)
  const emailRef = useRef<HTMLInputElement | null>(null)
  const messageRef = useRef<HTMLTextAreaElement | null>(null)
  const submitButtonRef = useRef<HTMLButtonElement | null>(null)
  const [mounted, setMounted] = useState(false)
  const [totalSize, setTotalSize] = useState(0)
  const [cfWidgetId, setCfWidgetId] = useState<number | null>(null)
  const [cfToken, setCfToken] = useState<string | null>(null)
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
    if (process.env.NEXT_PUBLIC_CF_TURNSTILE_SITEKEY) {
      const id = 'cf-turnstile-script'
      if (!document.getElementById(id)) {
        const s = document.createElement('script')
        s.id = id
        s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js'
        s.async = true
        s.defer = true
        document.body.appendChild(s)
      }
    }
  },[])

  // When script loads, render turnstile widget programmatically and capture token via callback
  useEffect(()=>{
    const sitekey = process.env.NEXT_PUBLIC_CF_TURNSTILE_SITEKEY
    if (!sitekey) return
    function tryRender(){
      // @ts-ignore
      if (typeof window !== 'undefined' && (window as any).turnstile && document.getElementById('cf-turnstile-container')) {
        // @ts-ignore
        const id = (window as any).turnstile.render(document.getElementById('cf-turnstile-container'), {
          sitekey,
          callback: (token: string) => setCfToken(token),
        })
        setCfWidgetId(typeof id === 'number' ? id : null)
      }
    }
    // Try immediately and also after a short delay in case script loads later
    tryRender()
    const t = setInterval(tryRender, 500)
    return ()=> clearInterval(t)
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

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>){
    const list = e.target.files
    if (!list) return
    const arr = Array.from(list)
    // limit total attachments to 6
    const merged = [...files, ...arr].slice(0,6)
    setFiles(merged)
    setTotalSize(merged.reduce((s,f)=> s + f.size, 0))
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
    if (!validate()) return
    setConfirmOpen(true)
  }

  async function confirmSend(){
    setConfirmOpen(false)
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
      await new Promise<void>((resolve, reject) => {
        xhr.open('POST', '/api/contact')
        xhr.onload = () => {
          try {
            const data = JSON.parse(xhr.responseText || '{}')
            if (xhr.status < 200 || xhr.status >= 300) {
              console.error('API /api/contact error', data)
              return reject(new Error(data?.details || data?.error || 'Send failed'))
            }
            resolve()
          } catch (err) { reject(err as any) }
        }
        xhr.onerror = () => reject(new Error('Network error'))
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
        // @ts-ignore
        if ((window as any).turnstile && cfWidgetId != null) (window as any).turnstile.reset(cfWidgetId)
        setCfToken(null)
      } catch (e) {}
      
      setSuccess(true)
      // clear form
      setName(''); setEmail(''); setMessage(''); setFiles([])
    } catch (err) {
      console.error('contact send error', err)
      setErrors(prev => ({ ...prev, _global: (err as any)?.message || 'Send failed' }))
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className={styles.contact}>
      <div className={styles.wrapper}>
        <Card title="Contact" subtitle="Get in touch">
          <div className={styles.inner}>
            {mounted ? (
              <form className={styles.form} onSubmit={handleSubmit} noValidate>
                <h3 className={styles.formHeading}>Message me now</h3>
              {errors._global && <div className={styles.formError} role="alert" aria-live="assertive">{errors._global}</div>}

              <label>
                Name
                <input ref={nameRef} aria-label="Name" aria-invalid={!!errors.name} aria-describedby={errors.name? 'err-name':''} value={name} onChange={(e)=> setName(e.target.value)} placeholder="Your name" />
                {errors.name && <div id="err-name" className={styles.formError} role="alert">{errors.name}</div>}
              </label>

              <label>
                Email
                <input ref={emailRef} aria-label="Email" type="email" aria-invalid={!!errors.email} aria-describedby={errors.email? 'err-email':''} value={email} onChange={(e)=> setEmail(e.target.value)} placeholder="you@example.com" />
                {errors.email && <div id="err-email" className={styles.formError} role="alert">{errors.email}</div>}
              </label>

              <label>
                Message
                <textarea ref={messageRef} aria-label="Message" aria-invalid={!!errors.message} aria-describedby={errors.message? 'err-message':''} value={message} onChange={(e)=> setMessage(e.target.value)} placeholder="Message" />
                {errors.message && <div id="err-message" className={styles.formError} role="alert">{errors.message}</div>}
              </label>

              <label className={`${styles.fileLabel} ${dragOver? styles.dropZone : ''}`} onDrop={handleDrop} onDragOver={handleDragOver} onDragLeave={()=> setDragOver(false)}>
                Attachments
                <div className={styles.fileControls}>
                  <button type="button" className={styles.chooseBtn} onClick={()=> fileInputRef.current?.click()}>Choose files</button>
                  <span className={styles.fileHint}>or drag & drop here</span>
                  <input id="file-input" ref={fileInputRef} type="file" accept="image/*,application/pdf,.txt,.doc,.docx" multiple onChange={handleFileChange} style={{display:'none'}} />
                </div>
                {errors.files && <div className={styles.formError} role="alert">{errors.files}</div>}
                {files.length>0 && (
                  <div className={styles.fileList}>
                    {files.map((f,i)=> (
                      <div key={i} className={styles.fileItem}>
                        {f.type.startsWith('image/') && (
                          <img onClick={()=> openPreview(f)} src={URL.createObjectURL(f)} alt={f.name} className={styles.fileThumb} />
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
              <div style={{position:'absolute',left:'-9999px',height:0,overflow:'hidden'}} aria-hidden>
                <label>Leave this field empty<input name="hp" tabIndex={-1} /></label>
              </div>

              {/* Cloudflare Turnstile widget (requires NEXT_PUBLIC_CF_TURNSTILE_SITEKEY in env) */}
              {process.env.NEXT_PUBLIC_CF_TURNSTILE_SITEKEY && (
                <div style={{marginTop:12}}>
                  <div className="cf-turnstile" data-sitekey={process.env.NEXT_PUBLIC_CF_TURNSTILE_SITEKEY}></div>
                </div>
              )}

                <div className={styles.actions}>
                  <button ref={submitButtonRef} type="submit" disabled={loading}>{loading? <span className={styles.spinner} aria-hidden></span>: 'Send'}</button>
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
        <div className={styles.modalOverlay} role="dialog" aria-modal="true">
          <div className={styles.modal}>
            <h4>Confirm message</h4>
            <p><strong>Name:</strong> {name || '—'}</p>
            <p><strong>Email:</strong> {email || '—'}</p>
            <p><strong>Message:</strong></p>
            <div className={styles.preview}>{message || '—'}</div>
            {files.length>0 && <p><strong>Attachments:</strong> {files.map(f=> f.name).join(', ')}</p>}
            <div style={{ display:'flex', gap:8, marginTop:12 }}>
              <button onClick={()=> setConfirmOpen(false)}>Cancel</button>
              <button onClick={confirmSend}>Confirm & Send</button>
            </div>
          </div>
        </div>
      )}

        {previewSrc && (
          <div className={styles.modalOverlay} role="dialog" aria-modal="true" onClick={closePreview}>
            <div className={styles.modal} onClick={(e)=> e.stopPropagation()}>
              <h4>{previewName}</h4>
              <img src={previewSrc} alt={previewName || 'preview'} style={{maxWidth:'100%', borderRadius:8}} />
              <div style={{display:'flex', justifyContent:'flex-end', marginTop:8}}>
                <button onClick={closePreview}>Close</button>
              </div>
            </div>
          </div>
        )}

        {uploadProgress !== null && (
          <div style={{position:'fixed',left:16,right:16,bottom:16,zIndex:2500}}>
            <div className={styles.progress}><div className={styles.progressInner} style={{width:`${uploadProgress}%`}} /></div>
          </div>
        )}

      {success && (
        <div className={styles.toast} role="status">Message sent — thanks! I'll reply as soon as I can.</div>
      )}
    </main>
  )
}
