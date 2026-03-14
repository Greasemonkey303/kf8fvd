export async function getUploadKey(slug: string, filename: string, prefixOverride?: string): Promise<string> {
  const envPrefix = process.env.S3_UPLOAD_PREFIX || 'projects/'
  let prefix = envPrefix
  try {
    // If caller provided an explicit prefix override, use it
    if (prefixOverride && typeof prefixOverride === 'string') {
      prefix = prefixOverride
    } else {
      const s = String(slug || '').toLowerCase()
      // If slug looks like an About page (starts with "about"), store under about/
      if (/^about($|[-_])/i.test(s) || s === 'about') {
        prefix = 'about/'
      }
      // If the slug appears to be credentials scoped, store under credentials/
      if (/^credentials($|[\/\-_])/i.test(s) || s.startsWith('credentials/')) {
        prefix = 'credentials/'
      }
    }
  } catch {
    // keep default
  }

  // normalize prefix to end with '/'
  if (!prefix.endsWith('/')) prefix = prefix + '/'

  // sanitize slug to avoid directory traversal and unsafe characters
  let rawSlug = String(slug || '')
  rawSlug = rawSlug.replace(/^\/+/, '') // strip leading slashes
  rawSlug = rawSlug.replace(/\.\./g, '') // remove parent traversal
  rawSlug = rawSlug.replace(/\/+/g, '/') // normalize repeated slashes
  rawSlug = rawSlug.replace(/[^a-zA-Z0-9\/_-]/g, '_') // restrict chars
  rawSlug = rawSlug.replace(/\/$/, '') // remove trailing slash

  const cleanFilename = String(filename || '').replace(/[^a-zA-Z0-9._-]/g, '_')
  const ts = Date.now()
  if (!rawSlug) return `${prefix}${ts}-${cleanFilename}`
  return `${prefix}${rawSlug}/${ts}-${cleanFilename}`
}

export function buildPublicUrl(key: string) {
  // Prefer returning a proxied API URL so the app can fetch objects regardless of MinIO bucket policy
  // Return a path-based proxied URL to avoid query-string issues with next/image localPatterns
  // Example: /api/uploads/get/<encoded-key>
  return `/api/uploads/get/${encodeURIComponent(key)}`
}
