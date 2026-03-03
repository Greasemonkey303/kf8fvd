"use client"

import React from 'react'
import styles from '../../../app/admin/admin.module.css'

export default function ProjectEditorSidebar({
  form,
  setForm,
  images,
  uploadMainImage,
  editMainImage,
  deleteMainImage,
  uploadFiles,
  uploadProgress,
  moveImage,
  editImage,
  deleteImage,
  onRemove,
}: any) {
  return (
    <aside>
      <div style={{marginBottom:12}}>
        <div className={styles.fieldLabel}>Main image</div>
        <div className={styles.mainPreview} style={{width:'100%', borderRadius:8}}>
          <img src={form.image_path || undefined} alt="Main" style={{width:'100%', height:220, objectFit:'cover', display:'block'}} />
        </div>
        <div style={{marginTop:10}} className={styles.smallMuted}>Select an image from the gallery to set as main, or upload/change below.</div>
        <div className={styles.controls} style={{marginTop:10}}>
          <button type="button" className={styles.btnGhost} onClick={editMainImage} title="Edit main image URL" style={{display:'inline-flex', alignItems:'center', gap:8}}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M3 21v-3.75L16.81 3.44a1.5 1.5 0 0 1 2.12 0l1.64 1.64a1.5 1.5 0 0 1 0 2.12L6.75 21H3z" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"/></svg>
            Edit
          </button>
          <button type="button" className={styles.btnGhost} onClick={deleteMainImage} title="Delete main image" style={{display:'inline-flex', alignItems:'center', gap:8}}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M3 6h18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><path d="M8 6v12a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2V6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/><path d="M10 11v6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><path d="M14 11v6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
            Delete
          </button>
          <label title="Upload new main image" className={styles.btnGhost + ' ' + styles.btnGhostSmall} style={{display:'inline-flex', alignItems:'center', gap:8}}>
            <input type="file" accept="image/*" onChange={e=>uploadMainImage(e.target.files?.[0] || null)} style={{display:'none'}} />
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 3v12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><path d="M8 7l4-4 4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/><path d="M5 21h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
            Upload
          </label>
        </div>
      </div>

      <div style={{marginTop:18}}>
        <div className={styles.fieldLabel}>Publish</div>
        <div style={{display:'flex', alignItems:'center', gap:12}}>
            <label className={styles.switch + ' ' + styles.switchSmall}>
              <input type="checkbox" checked={form.is_published} onChange={e=>setForm({...form, is_published: e.target.checked})} />
              <span className={`${styles.slider} ${form.is_published ? styles.on : ''}`} />
              <span className={styles.switchLabel}>{form.is_published ? 'Published' : 'Draft'}</span>
            </label>
        </div>
      </div>

      <div style={{marginTop:14}}>
        <div className={styles.fieldLabel}>Gallery</div>
        <div style={{display:'flex', gap:8, flexWrap:'wrap', marginTop:8}}>
          {images.slice(0,6).map((src:string, idx:number)=> (
            <div key={idx} style={{position:'relative', width:96}}>
              <img src={src} onClick={()=>setForm({...form, image_path: src})} className={styles.thumb} style={{boxShadow: src===form.image_path ? '0 0 0 3px #0b84ff66' : undefined, cursor:'pointer', width:96, height:72, objectFit:'cover'}} />
              <div className={styles.controls} style={{marginTop:6}}>
                <button type="button" className={styles.btnGhost} onClick={()=>moveImage(idx, -1)} disabled={idx===0} title="Move left">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </button>
                <button type="button" className={styles.btnGhost} onClick={()=>moveImage(idx, 1)} disabled={idx===Math.min(images.length,6)-1} title="Move right">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </button>
                <button type="button" className={styles.btnGhost} onClick={()=>editImage(idx)} title="Edit URL">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M3 21v-3.75L16.81 3.44a1.5 1.5 0 0 1 2.12 0l1.64 1.64a1.5 1.5 0 0 1 0 2.12L6.75 21H3z" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </button>
                <button type="button" className={styles.btnGhost} style={{marginLeft:'auto'}} onClick={()=>deleteImage(idx)}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M3 6h18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><path d="M8 6v12a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2V6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </button>
              </div>
            </div>
          ))}
        </div>
        <div style={{marginTop:8}}>
          <div className={styles.fieldLabel}>Upload images (max 6)</div>
          <label className={styles.btnGhost + ' ' + styles.btnGhostSmall} style={{display:'inline-flex', alignItems:'center', gap:8}}>
            <input type="file" accept="image/*" multiple onChange={e=>uploadFiles(e.target.files)} style={{display:'none'}} />
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 3v12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><path d="M8 7l4-4 4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/><path d="M5 21h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
            Upload images
          </label>
          {uploadProgress > 0 && (
            <div className="progress-bar" style={{marginTop:8}}>
              <div className="progress-bar-inner" style={{width:`${uploadProgress}%`}} />
            </div>
          )}
        </div>
      </div>

      <div style={{marginTop:18}}>
        <button className={styles.btnDanger} type="button" onClick={onRemove}>Delete Project</button>
      </div>
    </aside>
  )
}
