import Image from 'next/image'
import styles from '@/app/admin/admin.module.css'
import { buildPublicUrl } from '@/lib/s3'

type AdminObjectImageProps = {
  src?: string | null
  alt: string
  width: number
  height: number
  fallbackLabel?: string
  className?: string
  imageClassName?: string
  sizes?: string
}

function resolveImageUrl(value?: string | null) {
  if (!value) return ''
  const src = String(value)
  if (src.startsWith('/') || src.startsWith('data:') || src.startsWith('blob:')) return src
  if (/^https?:\/\//i.test(src)) {
    try {
      const parsed = new URL(src)
      const path = parsed.pathname.replace(/^\//, '')
      const bucket = (process.env.NEXT_PUBLIC_S3_BUCKET || '').trim()
      if (bucket && path.startsWith(bucket + '/')) {
        return buildPublicUrl(path.slice(bucket.length + 1))
      }
      if (src.includes('X-Amz-Algorithm') || src.includes('minio') || src.includes('127.0.0.1')) {
        return buildPublicUrl(path)
      }
      return src
    } catch {
      return src
    }
  }
  return buildPublicUrl(src)
}

function isUnoptimized(src: string) {
  return src.startsWith('data:') || src.startsWith('blob:') || src.includes('X-Amz-Algorithm') || src.includes('minio') || src.includes('127.0.0.1')
}

export default function AdminObjectImage({
  src,
  alt,
  width,
  height,
  fallbackLabel = 'No image',
  className,
  imageClassName,
  sizes,
}: AdminObjectImageProps) {
  const resolvedSrc = resolveImageUrl(src)

  return (
    <div className={[styles.imageFrame, className].filter(Boolean).join(' ')}>
      {resolvedSrc ? (
        <Image
          src={resolvedSrc}
          alt={alt}
          width={width}
          height={height}
          sizes={sizes}
          className={[styles.imageFrameImage, imageClassName].filter(Boolean).join(' ')}
          unoptimized={isUnoptimized(resolvedSrc)}
        />
      ) : (
        <div className={styles.imageFallback}>{fallbackLabel}</div>
      )}
    </div>
  )
}