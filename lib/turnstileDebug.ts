type TLogEntry = { ts: string; args: unknown[] }

declare global {
  interface Window {
    __kf8fvdTurnstileLogs?: TLogEntry[]
  }
}

export function tlog(...args: unknown[]) {
  try {
    if (typeof window === 'undefined') return
    const debugEnabled = process.env.NODE_ENV !== 'production'
      || process.env.NEXT_PUBLIC_TURNSTILE_DEBUG === '1'
      || window.localStorage?.getItem('kf8fvd_turnstile_debug') === '1'
      || new URLSearchParams(window.location.search).get('turnstileDebug') === '1'
    if (!debugEnabled) return
    // keep a lightweight in-memory log for easier copying
    window.__kf8fvdTurnstileLogs = window.__kf8fvdTurnstileLogs || []
    const now = new Date().toISOString()
    const entry: TLogEntry = { ts: now, args }
    window.__kf8fvdTurnstileLogs.push(entry)
    // concise console output for quick visibility
    try { console.log('[KF8FVD-TURNSTILE]', now, ...args) } catch (e) { void e }
  } catch (e) {
    void e
    // best-effort logging only
  }
}

export function getTLog(): TLogEntry[] {
  if (typeof window === 'undefined') return []
  return window.__kf8fvdTurnstileLogs || []
}
