"use client"

import { useEffect, useState } from 'react'

export default function useAdmin() {
  const [isAdmin, setIsAdmin] = useState(false)
  const [user, setUser] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(()=>{
    let mounted = true
    ;(async ()=>{
      try {
        const res = await fetch('/api/admin/whoami')
        const j = await res.json().catch(()=>({ admin: false }))
        if (!mounted) return
        setIsAdmin(!!j?.admin)
        setUser(j?.user?.name || j?.user?.email || null)
      } catch (e) {
        if (!mounted) return
        setIsAdmin(false)
        setUser(null)
      } finally {
        if (mounted) setLoading(false)
      }
    })()
    return ()=>{ mounted = false }
  }, [])

  return { isAdmin, user, loading }
}
