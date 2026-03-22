// Server-side sanitization helpers. Prefer `isomorphic-dompurify` when available,
// fall back to JSDOM + dompurify, and finally to a conservative regex/escape.
import isomorphicDompurify from 'isomorphic-dompurify'
import createDOMPurify from 'dompurify'
import { JSDOM } from 'jsdom'

type DomPurifyLike = { sanitize?: (input: string) => string }
export function escapeHtml(input: string) {
  return String(input || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function sanitizeHtmlServer(input: string): string {
  const s = String(input || '')
  if (!s) return ''
  // try isomorphic-dompurify first (works in Node)
  try {
    const iso = isomorphicDompurify as unknown as DomPurifyLike
    if (iso && typeof iso.sanitize === 'function') {
      try { return iso.sanitize(s, { FORBID_TAGS: ['script', 'style'] } as any) } catch { /* fallthrough */ }
    }
  } catch {
    // ignore
  }

  // try jsdom + dompurify
  try {
    const window = (new JSDOM('')).window
    const createDP = createDOMPurify as unknown as (win: unknown) => DomPurifyLike
    const DOMPurify = createDP(window)
    if (DOMPurify && typeof DOMPurify.sanitize === 'function') {
      try { return DOMPurify.sanitize(s, { FORBID_TAGS: ['script', 'style'] }) } catch { /* fallthrough */ }
    }
  } catch {
    // ignore
  }

  // final conservative fallback: strip <script> blocks, remove on* attributes and javascript: links
  try {
    let out = s.replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    out = out.replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, '')
    out = out.replace(/\son\w+=(["'])[\s\S]*?\1/gi, '')
    out = out.replace(/javascript:[^\"'\s>]+/gi, '#')
    return out
  } catch {
    return escapeHtml(s)
  }
}

const sanitizer = { escapeHtml, sanitizeHtmlServer }
export default sanitizer
