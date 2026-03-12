export function tlog(...args: any[]) {
  try {
    if (typeof window === 'undefined') {
      // server fallback
      // eslint-disable-next-line no-console
      console.log('[KF8FVD-TURNSTILE]', ...args)
      return
    }
    // keep a lightweight in-memory log for easier copying
    ;(window as any).__kf8fvdTurnstileLogs = (window as any).__kf8fvdTurnstileLogs || []
    const now = new Date().toISOString()
    const entry = { ts: now, args }
    ;(window as any).__kf8fvdTurnstileLogs.push(entry)
    // concise console output for quick visibility
    try { /* eslint-disable no-console */ console.log('[KF8FVD-TURNSTILE]', now, ...args) } catch (e) {}
  } catch (e) {
    // best-effort logging only
  }
}

export function getTLog() {
  if (typeof window === 'undefined') return []
  return (window as any).__kf8fvdTurnstileLogs || []
}
