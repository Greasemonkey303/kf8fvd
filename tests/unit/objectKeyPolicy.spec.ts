import { describe, expect, it } from 'vitest'
import { isPublicObjectKey, normalizeObjectKey } from '@/lib/objectKeyPolicy'

describe('object key policy', () => {
  it('accepts known public media prefixes', () => {
    expect(isPublicObjectKey('hero/static/station.jpg')).toBe(true)
    expect(isPublicObjectKey('about/headshot.webp')).toBe(true)
    expect(isPublicObjectKey('credentials/licenses/license.png')).toBe(true)
    expect(isPublicObjectKey('pages/about/hero.avif')).toBe(true)
    expect(isPublicObjectKey('projects/hotspot/photo.jpg')).toBe(true)
  })

  it('rejects private and unknown prefixes', () => {
    expect(isPublicObjectKey('messages/123/private.jpg')).toBe(false)
    expect(isPublicObjectKey('trash/project/deleted.jpg')).toBe(false)
    expect(isPublicObjectKey('healthchecks/probe.txt')).toBe(false)
    expect(isPublicObjectKey('restore-drills/sample.jpg')).toBe(false)
    expect(isPublicObjectKey('unknown/file.jpg')).toBe(false)
  })

  it('rejects encoded traversal and malformed keys', () => {
    expect(normalizeObjectKey('../messages/private.jpg')).toBeNull()
    expect(normalizeObjectKey('%252e%252e%252fmessages%252fprivate.jpg')).toBeNull()
    expect(normalizeObjectKey('hero//station.jpg')).toBeNull()
    expect(normalizeObjectKey('hero\\station.jpg')).toBeNull()
    expect(normalizeObjectKey('/hero/station.jpg')).toBeNull()
  })
})
