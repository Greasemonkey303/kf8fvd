import { describe, it, expect } from 'vitest'
import { sanitizeHtmlServer } from '../lib/sanitize'

describe('sanitizeHtmlServer', () => {
  it('removes script tags', () => {
    const input = '<div>Hello</div><script>alert(1)</script>'
    const out = sanitizeHtmlServer(input)
    expect(out).not.toContain('<script>')
    expect(out).toContain('Hello')
  })

  it('removes style tags', () => {
    const input = '<style>body{background:red}</style><p>Hi</p>'
    const out = sanitizeHtmlServer(input)
    expect(out).not.toContain('<style>')
    expect(out).toContain('Hi')
  })

  it('removes on* attributes and javascript: URIs', () => {
    const input = '<a href="javascript:evil()" onclick="doThing()">Click</a>'
    const out = sanitizeHtmlServer(input)
    expect(out).not.toMatch(/javascript:/i)
    expect(out).not.toMatch(/on\w+=/i)
    expect(out).toContain('Click')
  })
})
