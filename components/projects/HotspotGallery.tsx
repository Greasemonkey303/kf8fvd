"use client"

import React, { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import Image from 'next/image'
import styles from './HotspotGallery.module.css'

type Props = { images?: string[] }

export default function HotspotGallery({ images }: Props){
  const storageKey = 'kf8fvd-hotspot-images-v1'
  const [stored, setStored] = useState<string[]>([])
  const imgs = [ ...(images && images.length>0 ? images : [
    '/hotspot/hotspot-1.jpg',
    '/hotspot/hotspot-2.jpg',
    '/hotspot/hotspot-3.jpg'
  ]), ...stored ]
  const [open, setOpen] = useState<string | null>(null)

  useEffect(()=>{
    try { const s = JSON.parse(localStorage.getItem(storageKey) || '[]'); setStored(Array.isArray(s)? s: []); } catch(e){ setStored([]) }
  },[])

  useEffect(()=>{
    function onKey(e: KeyboardEvent){ if (e.key === 'Escape') setOpen(null) }
    window.addEventListener('keydown', onKey)
    return ()=> window.removeEventListener('keydown', onKey)
  },[])

  async function handleFiles(files: FileList | null) {
    if (!files) return;
    const added: string[] = []
    for (let i=0;i<files.length;i++){
      const f = files[i];
      if (!f.type.startsWith('image/')) continue;
      const data = await new Promise<string>((res)=>{
        const r = new FileReader(); r.onload = ()=> res(String(r.result)); r.readAsDataURL(f);
      })
      added.push(data)
    }
    if (added.length===0) return;
    const merged = [...added, ...stored].slice(0, 12)
    try { localStorage.setItem(storageKey, JSON.stringify(merged)); } catch(e) {}
    setStored(merged)
  }

  useEffect(()=>{
    if (open) {
      const prev = document.documentElement.style.overflow
      document.documentElement.style.overflow = 'hidden'
      return () => { document.documentElement.style.overflow = prev }
    }
  },[open])

  return (
    <div>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, marginBottom:8 }}>
        <div style={{ flex:1 }}>
          <div className={styles.gallery} aria-label="Hotspot images">
            {imgs.map((src,i)=> (
              <div key={i} className={styles.thumb} role="button" onClick={()=> setOpen(src)} onKeyDown={(e)=> { if (e.key==='Enter') setOpen(src) }} tabIndex={0}>
                <Image src={src} alt={`Hotspot ${i+1}`} fill unoptimized={String(src).startsWith('data:')} style={{objectFit:'cover'}} />
              </div>
            ))}
          </div>
        </div>
        
      </div>

      {open && typeof document !== 'undefined' && createPortal(
        <div className={styles.modalOverlay} role="dialog" aria-modal="true" onClick={()=> setOpen(null)}>
          <div className={styles.modal} onClick={(e)=> e.stopPropagation()}>
            <button aria-label="Close image" className={styles.modalClose} onClick={()=> setOpen(null)}>✕</button>
            <img src={open!} alt="Hotspot large" />
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
