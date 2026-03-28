"use client"

import React, { createContext, useCallback, useContext, useMemo, useState } from 'react'

type ToastType = 'success' | 'error' | 'info'
type Toast = { id: number; message: string; type?: ToastType }
type ToastContextValue = { showToast: (message: string, type?: ToastType) => void }

const ToastContext = createContext<ToastContextValue>({ showToast: () => {} })

export const useToast = () => useContext(ToastContext)

export default function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const showToast = useCallback((message: string, type: ToastType = 'info') => {
    const id = Date.now() + Math.floor(Math.random() * 1000)
    setToasts(prev => [...prev, { id, message, type }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000)
  }, [])
  const hideToast = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  const value = useMemo(() => ({ showToast }), [showToast])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div style={{ position: 'fixed', right: 18, bottom: 18, zIndex: 9999, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {toasts.map(t => (
          <div key={t.id} style={{ position: 'relative', minWidth: 220, padding: '10px 14px', borderRadius: 10, color: '#042034', background: t.type === 'success' ? '#b7f5d0' : t.type === 'error' ? '#ffd6d6' : '#d7edff', boxShadow: '0 8px 20px rgba(2,6,18,0.35)', border: '1px solid rgba(0,0,0,0.06)', fontWeight:700 }}>
            <button aria-label="Dismiss" onClick={()=>hideToast(t.id)} style={{ position:'absolute', right:8, top:6, background:'transparent', border:'none', color:'#042034', fontSize:14, cursor:'pointer' }}>×</button>
            <div style={{paddingRight:22}}>{t.message}</div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
