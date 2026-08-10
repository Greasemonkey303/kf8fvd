import { afterEach, describe, expect, it } from 'vitest'
import { hasValidImageSignature, validateImageUploadMetadata } from '@/lib/uploadValidation'

const originalMaxUploadBytes = process.env.MAX_UPLOAD_BYTES

afterEach(() => {
  if (originalMaxUploadBytes === undefined) delete process.env.MAX_UPLOAD_BYTES
  else process.env.MAX_UPLOAD_BYTES = originalMaxUploadBytes
})

describe('validateImageUploadMetadata', () => {
  it('accepts matching raster image metadata', () => {
    expect(validateImageUploadMetadata({ filename: 'station.JPG', contentType: 'image/jpeg', size: 1024 })).toMatchObject({
      ok: true,
      contentType: 'image/jpeg',
      extension: '.jpg',
    })
  })

  it('rejects SVG and mismatched MIME types', () => {
    expect(validateImageUploadMetadata({ filename: 'station.svg', contentType: 'image/svg+xml', size: 1024 })).toEqual({
      ok: false,
      error: 'Unsupported image type',
      status: 415,
    })
    expect(validateImageUploadMetadata({ filename: 'station.jpg', contentType: 'image/png', size: 1024 }).ok).toBe(false)
  })

  it('rejects empty and oversized uploads', () => {
    process.env.MAX_UPLOAD_BYTES = '100'
    expect(validateImageUploadMetadata({ filename: 'station.png', contentType: 'image/png', size: 0 })).toMatchObject({ ok: false, status: 400 })
    expect(validateImageUploadMetadata({ filename: 'station.png', contentType: 'image/png', size: 101 })).toMatchObject({ ok: false, status: 413 })
  })

  it('checks raster image signatures', () => {
    expect(hasValidImageSignature(Buffer.from([0xff, 0xd8, 0xff, 0x00]), 'image/jpeg')).toBe(true)
    expect(hasValidImageSignature(Buffer.from('not-a-jpeg'), 'image/jpeg')).toBe(false)
    expect(hasValidImageSignature(Buffer.from('GIF89a'), 'image/gif')).toBe(true)
    expect(hasValidImageSignature(Buffer.from('RIFF0000WEBP'), 'image/webp')).toBe(true)
  })
})
