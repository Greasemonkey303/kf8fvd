"use client"
import { useState } from 'react'
import styles from '../../admin.module.css'

export default function UnlockButton({ keyName }: { keyName: string }) {
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

  async function handle(e: React.MouseEvent) {
    e.preventDefault()
    if (loading || done) return
    setLoading(true)
    try {
      const res = await fetch('/admin/utilities/api/unlock', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-requested-with': 'XMLHttpRequest'
        },
        credentials: 'same-origin',
        body: JSON.stringify({ key_name: keyName })
      })
      const j = await res.json().catch(() => ({}))
      if (res.ok && j && j.ok) {
        setDone(true)
        // remove the table row if possible
        try {
          const btn = document.querySelector(`button[data-key="${encodeURIComponent(keyName)}"]`)
          if (btn) {
            const tr = btn.closest('tr')
            if (tr) tr.remove()
          } else {
            window.location.reload()
          }
        } catch { window.location.reload() }
      } else {
        alert('Unlock failed: ' + (j.error || res.status))
      }
    } catch {
      alert('Unlock error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      data-key={encodeURIComponent(keyName)}
      className={done ? styles.btnDisabled : styles.btnDanger}
      onClick={handle}
      disabled={loading || done}
    >
      {loading ? 'Unlocking...' : done ? 'Unlocked' : 'Unlock'}
    </button>
  )
}
