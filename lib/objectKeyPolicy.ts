const PUBLIC_OBJECT_PREFIXES = ['about/', 'credentials/', 'hero/', 'pages/', 'projects/'] as const

export function normalizeObjectKey(value: unknown): string | null {
  if (typeof value !== 'string') return null

  let key = value.trim()
  if (!key || key.length > 2048) return null

  for (let attempt = 0; attempt < 3 && key.includes('%'); attempt += 1) {
    try {
      const decoded = decodeURIComponent(key)
      if (decoded === key) break
      key = decoded
    } catch {
      return null
    }
  }

  if (!key || key.startsWith('/') || key.includes('\\') || /[\u0000-\u001f\u007f]/.test(key)) return null

  const segments = key.split('/')
  if (segments.some((segment) => !segment || segment === '.' || segment === '..')) return null

  return key
}

export function isPublicObjectKey(value: unknown): boolean {
  const key = normalizeObjectKey(value)
  return Boolean(key && PUBLIC_OBJECT_PREFIXES.some((prefix) => key.startsWith(prefix)))
}
