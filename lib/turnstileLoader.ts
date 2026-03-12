export type LoaderOptions = {
  id?: string
  src?: string
  timeoutMs?: number
}

export function loadTurnstileScript(opts: LoaderOptions = {}) {
  const id = opts.id || 'cf-turnstile-script'
  const src = opts.src || 'https://challenges.cloudflare.com/turnstile/v0/api.js'
  const timeoutMs = typeof opts.timeoutMs === 'number' ? opts.timeoutMs : 10000
  return new Promise<HTMLScriptElement>((resolve, reject) => {
    if (typeof window === 'undefined') return reject(new Error('no-window'))
    const existing = document.getElementById(id) as HTMLScriptElement | null
    if (existing && (window as any).turnstile) return resolve(existing)
    if (existing) {
      const onLoad = () => resolve(existing)
      const onErr = () => reject(new Error('turnstile-script-error'))
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
    if ((window as any).turnstile) return resolve()
    const start = Date.now()
    const iv = window.setInterval(() => {
      if ((window as any).turnstile) {
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
