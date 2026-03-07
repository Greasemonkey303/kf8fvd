export async function getUploadKey(slug: string, filename: string, prefixOverride?: string): Promise<string> {
  const envPrefix = process.env.S3_UPLOAD_PREFIX || 'projects/'
  let prefix = envPrefix
  try {
    // If caller provided an explicit prefix override, use it
    if (prefixOverride && typeof prefixOverride === 'string') {
      prefix = prefixOverride
    } else {
      const s = String(slug || '')
      // If slug looks like an About page (starts with "about"), store under about/
      if (/^about($|[-_])/i.test(s) || s.toLowerCase() === 'about') {
        prefix = 'about/'
      }
      // If the slug appears to be credentials scoped, store under credentials/
      if (/^credentials($|[\/\-_])/i.test(s) || s.toLowerCase().startsWith('credentials/')) {
        prefix = 'credentials/'
      }
    }
  } catch {
    // keep default
  }
  const cleanFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '_')
  const ts = Date.now()
  return `${prefix}${slug}/${ts}-${cleanFilename}`
}

export function buildPublicUrl(key: string) {
  // Prefer returning a proxied API URL so the app can fetch objects regardless of MinIO bucket policy
  // Return a path-based proxied URL to avoid query-string issues with next/image localPatterns
  // Example: /api/uploads/get/<encoded-key>
  return `/api/uploads/get/${encodeURIComponent(key)}`
}
