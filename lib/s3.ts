export async function getUploadKey(slug: string, filename: string): Promise<string> {
  const prefix = process.env.S3_UPLOAD_PREFIX || 'projects/'
  const cleanFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '_')
  const ts = Date.now()
  return `${prefix}${slug}/${ts}-${cleanFilename}`
}

export function buildPublicUrl(key: string) {
  // Prefer returning a proxied API URL so the app can fetch objects regardless of MinIO bucket policy
  // This returns a relative API URL: /api/uploads/get?key=...
  return `/api/uploads/get?key=${encodeURIComponent(key)}`
}
