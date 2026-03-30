'use client'

import { useEffect, useRef } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'

const excludedPrefixes = [
  '/admin',
  '/api',
  '/signin',
  '/logout',
  '/forgot-password',
  '/reset-password',
]

const cacheKey = 'kf8fvd-umami-cache'

type DoNotTrackWindow = Window & {
  doNotTrack?: string | number
}

type DoNotTrackNavigator = Navigator & {
  msDoNotTrack?: string | number
}

function buildRouteKey(pathname: string, searchParams: URLSearchParams | null) {
  const query = searchParams?.toString()
  return query ? `${pathname}?${query}` : pathname
}

function isExcludedPath(pathname: string) {
  return excludedPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))
}

function localhostAllowed() {
  return process.env.NEXT_PUBLIC_UMAMI_ALLOW_LOCALHOST === '1'
}

function trackingDisabled(pathname: string) {
  if (isExcludedPath(pathname)) return true

  const hostname = window.location.hostname
  if ((hostname === 'localhost' || hostname === '127.0.0.1') && !localhostAllowed()) {
    return true
  }

  const doNotTrack = (window as DoNotTrackWindow).doNotTrack || navigator.doNotTrack || (navigator as DoNotTrackNavigator).msDoNotTrack
  return doNotTrack === '1' || doNotTrack === 'yes' || doNotTrack === 1
}

export default function UmamiPageTracker() {
  const pathname = usePathname() || '/'
  const searchParams = useSearchParams()
  const lastTrackedRouteRef = useRef<string>('')
  const previousUrlRef = useRef<string>('')

  useEffect(() => {
    const websiteId = process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID?.trim()
    const routeKey = buildRouteKey(pathname, searchParams)
    if (!websiteId || lastTrackedRouteRef.current === routeKey) return
    if (trackingDisabled(pathname)) return

    let cancelled = false
    const currentUrl = window.location.href
    const referrer = previousUrlRef.current || document.referrer || ''

    const sendPageview = async () => {
      if (cancelled) return

      try {
        const cache = window.sessionStorage.getItem(cacheKey) || undefined
        const response = await fetch('/api/analytics/umami', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(cache ? { 'x-umami-cache': cache } : {}),
          },
          body: JSON.stringify({
            type: 'event',
            payload: {
              website: websiteId,
              hostname: window.location.hostname,
              language: navigator.language,
              screen: `${window.screen.width}x${window.screen.height}`,
              title: document.title,
              url: `${pathname}${searchParams?.toString() ? `?${searchParams.toString()}` : ''}`,
              referrer,
            },
          }),
          keepalive: true,
        })

        if (!response.ok) return

        const data = await response.json().catch(() => null)
        if (cancelled) return

        if (data?.cache) {
          window.sessionStorage.setItem(cacheKey, data.cache)
        }

        lastTrackedRouteRef.current = routeKey
        previousUrlRef.current = currentUrl
      } catch {
        // Best effort: analytics failures must not affect navigation.
      }
    }

    void sendPageview()

    return () => {
      cancelled = true
    }
  }, [pathname, searchParams])

  return null
}