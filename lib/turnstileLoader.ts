export type LoaderOptions = {
  id?: string
  src?: string
  timeoutMs?: number
}

type ScriptWithReadyState = HTMLScriptElement & {
  readyState?: 'loading' | 'loaded' | 'complete'
}

import { tlog } from './turnstileDebug'

export function loadTurnstileScript(opts: LoaderOptions = {}) {
  const id = opts.id || 'cf-turnstile-script'
  const src = opts.src || 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
  const timeoutMs = typeof opts.timeoutMs === 'number' ? opts.timeoutMs : 10000
  return new Promise<HTMLScriptElement>((resolve, reject) => {
    if (typeof window === 'undefined') return reject(new Error('no-window'))
    const existing = document.getElementById(id) as HTMLScriptElement | null
    const _win = window as unknown as Record<string, unknown>
    if (existing) {
      // If the global is already present, we're done.
      if (_win.turnstile) {
        tlog('loadTurnstileScript: existing script and global present')
        return resolve(existing)
      }
      // If the script element exists but the global is not yet defined,
      // don't reject immediately — resolve and let the caller wait for
      // the Turnstile global using `waitForTurnstileReady`.
      try {
        const rs = (existing as ScriptWithReadyState).readyState
        if (rs === 'complete' || rs === 'loaded') {
          tlog('loadTurnstileScript: existing script readyState', rs)
          return resolve(existing)
        }
      } catch (e) { void e }
      const onLoad = () => { tlog('loadTurnstileScript: script load event'); resolve(existing) }
      const onErr = () => { tlog('loadTurnstileScript: script error event'); reject(new Error('turnstile-script-error')) }
      existing.addEventListener('load', onLoad)
      existing.addEventListener('error', onErr)
      setTimeout(() => reject(new Error('turnstile-script-timeout')), timeoutMs)
      return
    }
    const s = document.createElement('script')
    s.id = id
    s.src = src
    s.async = true
    s.defer = true
    const onLoad = () => resolve(s)
    const onErr = () => reject(new Error('turnstile-script-error'))
    s.addEventListener('load', onLoad)
    s.addEventListener('error', onErr)
    document.head.appendChild(s)
    setTimeout(() => reject(new Error('turnstile-script-timeout')), timeoutMs)
  })
}

export function waitForTurnstileReady(timeoutMs = 5000) {
  return new Promise<void>((resolve, reject) => {
    if (typeof window === 'undefined') return reject(new Error('no-window'))
    const _win = window as unknown as Record<string, unknown>
    if (_win.turnstile) return resolve()
    const start = Date.now()
    const iv = window.setInterval(() => {
      const _win2 = window as unknown as Record<string, unknown>
      if (_win2.turnstile) {
        clearInterval(iv)
        return resolve()
      }
      if (Date.now() - start > timeoutMs) {
        clearInterval(iv)
        return reject(new Error('turnstile-ready-timeout'))
      }
    }, 200)
  })
}

export async function fetchTurnstileSiteKey() {
  try {
    const res = await fetch('/api/public-config')
    if (!res.ok) return null
    const j = await res.json()
    return (j && typeof j.turnstileSiteKey === 'string') ? j.turnstileSiteKey : null
  } catch (e) {
    return null
  }
}
