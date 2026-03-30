'use client'

import Script from 'next/script'

function normalizeUrl(value: string | undefined) {
  return value?.trim().replace(/\/+$/, '') || ''
}

export default function UmamiAnalytics() {
  const websiteId = process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID?.trim()
  const hostUrl = normalizeUrl(process.env.NEXT_PUBLIC_UMAMI_HOST_URL)
  const scriptUrl = normalizeUrl(process.env.NEXT_PUBLIC_UMAMI_SCRIPT_URL) || (hostUrl ? `${hostUrl}/script.js` : '')
  const domains = process.env.NEXT_PUBLIC_UMAMI_DOMAINS?.trim()
  const allowLocalhost = process.env.NEXT_PUBLIC_UMAMI_ALLOW_LOCALHOST === '1'

  if (!websiteId || !scriptUrl) {
    return null
  }

  return (
    <>
      <Script id="kf8fvd-umami-before-send" src="/umami-before-send.js" strategy="afterInteractive" />
      <Script
        id="kf8fvd-umami"
        src={scriptUrl}
        strategy="afterInteractive"
        data-website-id={websiteId}
        data-host-url={hostUrl || undefined}
        data-domains={domains || undefined}
        data-allow-localhost={allowLocalhost ? 'true' : undefined}
        data-auto-track="false"
        data-do-not-track="true"
        data-exclude-search="true"
        data-before-send="kf8fvdUmamiBeforeSend"
      />
    </>
  )
}