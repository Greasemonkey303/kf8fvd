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
  const submitButtonRef = useRef<HTMLButtonElement | null>(null)
  const [mounted, setMounted] = useState(false)

  useEffect(()=>{
    if (success) {
      const t = setTimeout(()=> setSuccess(false), 3500)
      return ()=> clearTimeout(t)
    }
  },[success])

  useEffect(()=>{
    setMounted(true)
  },[])

  function validate(){
    const e: Record<string,string> = {}
    if (!name.trim()) e.name = 'Please enter your name.'
    if (!email.trim()) e.email = 'Please enter your email.'
    else if (!isValidEmail(email.trim())) e.email = 'Please enter a valid email address.'
    if (!message.trim() || message.trim().length < 10) e.message = 'Please enter a message (10+ characters).'
    // file size limits (5MB each)
    for (let i=0;i<files.length;i++){
      const f = files[i]
      if (f.size > 5 * 1024 * 1024) { e.files = 'Each attachment must be 5MB or smaller.'; break }
    }
    setErrors(e)
    return Object.keys(e).length === 0
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>){
    const list = e.target.files
    if (!list) return
    const arr = Array.from(list)
    // limit total attachments to 6
    const merged = [...files, ...arr].slice(0,6)
    setFiles(merged)
    // reset input to allow re-adding same file
    if (fileInputRef.current) fileInputRef.current.value = ''
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
      const fd = new FormData()
      fd.append('name', name)
      fd.append('email', email)
      fd.append('message', message)
      files.forEach((f, i) => fd.append(`file-${i}`, f))

      const res = await fetch('/api/contact', {
        method: 'POST',
        body: fd
      })

      const data = await res.json()
      if (!res.ok) {
        console.error('API /api/contact error', data)
        const msg = data?.details || data?.error || 'Send failed'
        throw new Error(msg)
      }

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

              <label>
                Name
                <input aria-label="Name" aria-invalid={!!errors.name} aria-describedby={errors.name? 'err-name':''} value={name} onChange={(e)=> setName(e.target.value)} placeholder="Your name" />
                {errors.name && <div id="err-name" className={styles.formError} role="alert">{errors.name}</div>}
              </label>

              <label>
                Email
                <input aria-label="Email" type="email" aria-invalid={!!errors.email} aria-describedby={errors.email? 'err-email':''} value={email} onChange={(e)=> setEmail(e.target.value)} placeholder="you@example.com" />
                {errors.email && <div id="err-email" className={styles.formError} role="alert">{errors.email}</div>}
              </label>

              <label>
                Message
                <textarea aria-label="Message" aria-invalid={!!errors.message} aria-describedby={errors.message? 'err-message':''} value={message} onChange={(e)=> setMessage(e.target.value)} placeholder="Message" />
                {errors.message && <div id="err-message" className={styles.formError} role="alert">{errors.message}</div>}
              </label>

              <label className={styles.fileLabel}>
                Attachments
                <input ref={fileInputRef} type="file" accept="image/*,application/pdf,.txt,.doc,.docx" multiple onChange={handleFileChange} />
                {errors.files && <div className={styles.formError} role="alert">{errors.files}</div>}
                {files.length>0 && (
                  <div className={styles.fileList}>
                    {files.map((f,i)=> (
                      <div key={i} className={styles.fileItem}>
                        {f.type.startsWith('image/') && (
                          <img src={URL.createObjectURL(f)} alt={f.name} className={styles.fileThumb} />
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

                <div className={styles.actions}>
                  <button ref={submitButtonRef} type="submit">{loading? <span className={styles.spinner} aria-hidden></span>: 'Send'}</button>
                  <a href="/credentials">View Credentials</a>
                </div>
              </form>
            ) : (
              <div className={styles.formPlaceholder} aria-hidden>Loading form…</div>
            )}

            <div className={styles.contactInfo}>
              <h3 className={styles.contactHeading}>Email me directly</h3>
              <a className={styles.mailto} href="mailto:zach@kf8fvd">✉️ zach@kf8fvd</a>
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

      {success && (
        <div className={styles.toast} role="status">Message sent — thanks! I'll reply as soon as I can.</div>
      )}
    </main>
  )
}
