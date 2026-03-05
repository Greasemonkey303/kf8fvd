export async function getUploadKey(slug: string, filename: string): Promise<string> {
  const prefix = process.env.S3_UPLOAD_PREFIX || 'projects/'
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
