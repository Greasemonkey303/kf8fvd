"use client"

import React from 'react'
import styles from './back.module.css'

export default function BackButton(){
  const handle = () => {
    if (typeof window !== 'undefined') window.history.back()
  }

  return (
    <button type="button" className={styles.backBtn} onClick={handle} aria-label="Go back">
      ← Back
    </button>
  )
}
