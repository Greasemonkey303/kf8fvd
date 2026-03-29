"use client"

import { useEffect } from 'react'

type ClientErrorPayload = {
  type: 'window-error' | 'unhandled-rejection' | 'fetch-error'
  message: string
  stack?: string | null
  url?: string | null
  source?: string | null
  status?: number | null
  method?: string | null
  route?: string | null
  count?: number
}

const MONITOR_ENDPOINT = '/api/client-errors'
const DEDUPE_WINDOW_MS = 30_000

function trim(value: string | null | undefined, max = 1500) {
  if (!value) return null
  return value.length > max ? value.slice(0, max) : value
}

function isSameOriginRequest(input: RequestInfo | URL) {
  const raw = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
  if (!raw) return false
  if (raw.startsWith('/')) return true
  try {
    return new URL(raw, window.location.origin).origin === window.location.origin
  } catch {
    return false
  }
}

function shouldIgnoreUrl(url: string | null | undefined) {
  if (!url) return true
  return url.includes(MONITOR_ENDPOINT) || url.includes('/api/auth/session')
}

export default function ClientErrorMonitor() {
  useEffect(() => {
    const seen = new Map<string, { lastSentAt: number; count: number }>()

    const send = (payload: ClientErrorPayload) => {
      const signature = JSON.stringify([
        payload.type,
        payload.message,
        payload.url || '',
        payload.source || '',
        payload.status || '',
        payload.method || '',
      ])
      const now = Date.now()
      const existing = seen.get(signature)

      if (existing && now - existing.lastSentAt < DEDUPE_WINDOW_MS) {
        existing.count += 1
        return
      }

      const count = existing ? existing.count + 1 : 1
      seen.set(signature, { lastSentAt: now, count: 0 })

      const body = JSON.stringify({
        ...payload,
        count,
        route: payload.route || window.location.pathname,
        url: trim(payload.url || window.location.href),
        source: trim(payload.source),
        message: trim(payload.message, 800) || 'Unknown client error',
        stack: trim(payload.stack, 2000),
        href: trim(window.location.href),
        userAgent: trim(window.navigator.userAgent, 500),
        timestamp: new Date().toISOString(),
      })

      try {
        if (typeof navigator.sendBeacon === 'function') {
          const blob = new Blob([body], { type: 'application/json' })
          navigator.sendBeacon(MONITOR_ENDPOINT, blob)
          return
        }
      } catch {}

      void fetch(MONITOR_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        keepalive: true,
      }).catch(() => undefined)
    }

    const onWindowError = (event: ErrorEvent) => {
      send({
        type: 'window-error',
        message: event.message || 'Unhandled window error',
        stack: event.error instanceof Error ? event.error.stack : null,
        source: event.filename || null,
        url: window.location.href,
      })
    }

    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason
      const message = reason instanceof Error ? reason.message : typeof reason === 'string' ? reason : 'Unhandled promise rejection'
      send({
        type: 'unhandled-rejection',
        message,
        stack: reason instanceof Error ? reason.stack : null,
        url: window.location.href,
      })
    }

    const originalFetch = window.fetch.bind(window)
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const sameOrigin = isSameOriginRequest(input)
      const requestUrl = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
      const method = init?.method || (input instanceof Request ? input.method : 'GET')

      try {
        const response = await originalFetch(input, init)
        if (sameOrigin && !shouldIgnoreUrl(requestUrl) && response.status >= 500) {
          send({
            type: 'fetch-error',
            message: `Fetch failed with ${response.status}`,
            status: response.status,
            method,
            url: requestUrl,
          })
        }
        return response
      } catch (error) {
        if (sameOrigin && !shouldIgnoreUrl(requestUrl)) {
          send({
            type: 'fetch-error',
            message: error instanceof Error ? error.message : 'Fetch request failed',
            stack: error instanceof Error ? error.stack : null,
            method,
            url: requestUrl,
          })
        }
        throw error
      }
    }

    window.addEventListener('error', onWindowError)
    window.addEventListener('unhandledrejection', onUnhandledRejection)

    return () => {
      window.removeEventListener('error', onWindowError)
      window.removeEventListener('unhandledrejection', onUnhandledRejection)
      window.fetch = originalFetch
    }
  }, [])

  return null
}