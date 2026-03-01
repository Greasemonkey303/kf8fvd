export async function getUploadKey(slug: string, filename: string): Promise<string> {
  const prefix = process.env.S3_UPLOAD_PREFIX || 'projects/'
  const cleanFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '_')
  const ts = Date.now()
  return `${prefix}${slug}/${ts}-${cleanFilename}`
}

export function buildPublicUrl(key: string) {
  // Prefer explicit base URL if provided (access point alias)
  const base = process.env.NEXT_PUBLIC_S3_BASE_URL
  if (base) return `${base.replace(/\/$/, '')}/${key}`
  // fallback: S3 path-style using bucket env (may not work for access points)
  const bucket = process.env.NEXT_PUBLIC_S3_BUCKET
  const region = process.env.AWS_REGION || 'us-east-2'
  if (bucket && bucket.startsWith('arn:')) {
    // cannot reliably construct from ARN; return key only
    return key
  }
  return `https://${bucket}.s3.${region}.amazonaws.com/${key}`
}
