import path from 'path'

const IMAGE_TYPES_BY_EXTENSION: Record<string, string> = {
  '.avif': 'image/avif',
  '.gif': 'image/gif',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
}

export function getSafeImageContentType(filename: string) {
  return IMAGE_TYPES_BY_EXTENSION[path.extname(String(filename || '')).toLowerCase()] || null
}

export function hasValidImageSignature(buffer: Buffer, contentType: string) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 4) return false

  if (contentType === 'image/jpeg') {
    return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff
  }
  if (contentType === 'image/png') {
    return buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  }
  if (contentType === 'image/gif') {
    const signature = buffer.subarray(0, 6).toString('ascii')
    return signature === 'GIF87a' || signature === 'GIF89a'
  }
  if (contentType === 'image/webp') {
    return buffer.length >= 12 && buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  }
  if (contentType === 'image/avif') {
    if (buffer.length < 12 || buffer.subarray(4, 8).toString('ascii') !== 'ftyp') return false
    const brands = buffer.subarray(8, Math.min(buffer.length, 32)).toString('ascii')
    return brands.includes('avif') || brands.includes('avis')
  }

  return false
}

type UploadMetadata = {
  filename: string
  contentType: string
  size?: number
}

export type ValidImageUpload = {
  ok: true
  contentType: string
  extension: string
  maxBytes: number
}

export type InvalidImageUpload = {
  ok: false
  error: string
  status: 400 | 413 | 415
}

export function getMaxImageUploadBytes() {
  const configured = Number(process.env.MAX_UPLOAD_BYTES || 50 * 1024 * 1024)
  return Number.isFinite(configured) && configured > 0 ? Math.floor(configured) : 50 * 1024 * 1024
}

export function validateImageUploadMetadata(input: UploadMetadata): ValidImageUpload | InvalidImageUpload {
  const extension = path.extname(String(input.filename || '')).toLowerCase()
  const contentType = String(input.contentType || '').split(';', 1)[0].trim().toLowerCase()
  const expectedType = getSafeImageContentType(input.filename)

  if (!expectedType || expectedType !== contentType) {
    return { ok: false, error: 'Unsupported image type', status: 415 }
  }

  const maxBytes = getMaxImageUploadBytes()
  if (input.size !== undefined) {
    if (!Number.isFinite(input.size) || input.size < 1) {
      return { ok: false, error: 'Invalid file size', status: 400 }
    }
    if (input.size > maxBytes) {
      return { ok: false, error: 'File too large', status: 413 }
    }
  }

  return { ok: true, contentType, extension, maxBytes }
}
