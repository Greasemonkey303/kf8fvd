import React from 'react'
import styles from './hero.module.css'
import { buildPublicUrl } from '@/lib/s3'
import { query } from '@/lib/db'
/* eslint-disable @typescript-eslint/no-var-requires */
let DOMPurify: any = null
try {
  // require is synchronous and avoids static bundler resolution failures
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  DOMPurify = require('isomorphic-dompurify')
} catch (e) {
  DOMPurify = null
}

const sanitizeHtml = (input: string) => {
  if (!input) return ''
  try {
    if (DOMPurify && typeof DOMPurify.sanitize === 'function') {
      return DOMPurify.sanitize(input, { USE_PROFILES: { html: true } })
    }
  } catch (e) {
    // fall through to regex fallback
  }
  // fallback to a minimal regex sanitizer if DOMPurify isn't available
  let s = String(input).replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
  s = s.replace(/\son\w+=["'][\s\S]*?["']/gi, '')
  s = s.replace(/javascript:[^"'\s>]+/gi, '#')
  return s
}

async function fetchHero() {
  try {
    const heroes = await query<any[]>('SELECT * FROM hero ORDER BY id ASC LIMIT 1')
    const hero = Array.isArray(heroes) && heroes.length ? heroes[0] : null
    if (!hero) return { hero: null, images: [] }
    const images = await query<any[]>('SELECT * FROM hero_image WHERE hero_id = ? ORDER BY is_featured DESC, sort_order ASC', [hero.id])
    return { hero, images }
  } catch (err: unknown) {
    // eslint-disable-next-line no-console
    console.error('containers/hero fetchHero error', err)
    return { hero: null, images: [] }
  }
}

export default async function Hero() {
  const data = await fetchHero()
  const hero = data?.hero || null
  const images = Array.isArray(data?.images) ? data.images : []
  const featured = images.find((i: any) => i.is_featured) || images[0] || null

  let imageSrc = '/grand_rapids.jpg'
  try {
    if (featured && featured.url) {
      const raw = String(featured.url || '')
      // If the URL is already a local path, use it directly
      if (raw.startsWith('/')) {
        imageSrc = raw
      } else if (/^https?:\/\//i.test(raw)) {
        // Handle presigned MinIO/S3 URLs: try to convert to proxied API URL
        try {
          const u = new URL(raw)
          const pclean = (u.pathname || '').replace(/^\//, '')
          // Determine bucket name (prefer NEXT_PUBLIC_S3_BUCKET env when available)
          const bucket = (process.env.NEXT_PUBLIC_S3_BUCKET || '').trim() || pclean.split('/')[0] || ''
          if (bucket && pclean.startsWith(bucket + '/')) {
            const key = pclean.slice(bucket.length + 1)
            imageSrc = buildPublicUrl(key)
          } else {
            // not a bucket-style path we can proxy; fall back to raw URL
            imageSrc = raw
          }
        } catch (err) {
          imageSrc = raw
        }
      } else {
        // treat as stored key (e.g. 'hero/1/xxx.jpg') and proxy via API
        imageSrc = buildPublicUrl(raw)
      }
    }
  } catch (e) {
    imageSrc = '/grand_rapids.jpg'
  }

  const rawAlt = featured?.alt ? String(featured.alt) : ''
  const altText = rawAlt ? rawAlt.replace(/\.[^.\/\\]+$/, '') : 'Hero image'
  const imageUnoptimized = /^https?:\/\//i.test(imageSrc) || imageSrc.startsWith('/api/uploads/get/')

  // Build variant URLs if available
  let avifUrl: string | null = null
  let webpUrl: string | null = null
  try {
    let variants: any = featured?.variants
    if (variants && typeof variants === 'string') {
      try { variants = JSON.parse(variants) } catch { /* ignore */ }
    }
    if (variants && typeof variants === 'object') {
      if (variants.avif) {
        const v = String(variants.avif)
        avifUrl = v.startsWith('/') || /^https?:\/\//i.test(v) ? v : buildPublicUrl(v)
      }
      if (variants.webp) {
        const v = String(variants.webp)
        webpUrl = v.startsWith('/') || /^https?:\/\//i.test(v) ? v : buildPublicUrl(v)
      }
    }
  } catch (e) {
    // ignore
  }

  const fallbackSrc = imageSrc

  return (
    <section className={styles.hero} aria-labelledby="hero-title" role="region">
      <picture className={styles.bg}>
        {avifUrl && <source srcSet={avifUrl} type="image/avif" />}
        {webpUrl && <source srcSet={webpUrl} type="image/webp" />}
        <img src={fallbackSrc} alt={altText} className={styles.bgImg} />
      </picture>
      <div className={styles.inner}>
        <h1 id="hero-title">{hero?.title || 'KF8FVD - Amateur Radio'}</h1>
        {hero && hero.content && String(hero.content).trim() ? (
          <div className={styles.content} dangerouslySetInnerHTML={{ __html: sanitizeHtml(String(hero.content)) }} />
        ) : (
          <p className={styles.lead}>{hero?.subtitle || 'Welcome to my ham radio site. Explore HF bands, equipment, and more.'}</p>
        )}
        <div className={styles.heroCtaWrap}>
          <a href="/contactme" className={styles.heroBtn} aria-label="Contact Me">Contact Me</a>
          <div className={styles.heroNote}>Click to get in touch or schedule a QSO</div>
        </div>
      </div>
    </section>
  )
}