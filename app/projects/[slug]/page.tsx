import React from 'react'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Card } from '@/components'
import ProjectMediaWrapper from '@/components/projects/ProjectMediaWrapper'
import * as Minio from 'minio'
import { buildPublicUrl } from '@/lib/s3'
import styles from '../hotspot/hotspot.module.css'
import { HotspotGallery } from '@/components'
import { query } from '@/lib/db'
import createDOMPurify from 'dompurify'
import { JSDOM } from 'jsdom'

type Props = { params: { slug: string } }

export default async function Page({ params }: Props){
  const { slug } = params
  if (!slug) return notFound()
  const rows = (await query('SELECT id, slug, title, subtitle, image_path, description, external_link, metadata, is_published FROM projects WHERE slug = ? LIMIT 1', [slug])) as Array<Record<string, unknown>>
  const project = Array.isArray(rows) && rows[0] ? (rows[0] as Record<string, unknown>) : null
  if (!project) return notFound()
  const isPublished = project.is_published === true || project.is_published === 1 || project.is_published === '1'
  if (!isPublished) return notFound()

  // parse metadata images
  let md: unknown = null
  try { md = project.metadata ? JSON.parse(String(project.metadata)) : null } catch (e) { md = project.metadata }

  function normalizeImages(m: unknown): string[] {
    if (!m) return []
    // Already an array
    if (Array.isArray(m)) return m.filter(Boolean) as string[]

    // Object with images property
    if (typeof m === 'object' && m !== null && 'images' in m) {
      const imgs = (m as Record<string, unknown>).images
      if (Array.isArray(imgs)) return imgs.filter(Boolean) as string[]
      if (typeof imgs === 'string') {
        try {
          const p = JSON.parse(imgs)
          if (Array.isArray(p)) return p.filter(Boolean) as string[]
        } catch (e) {
          // not JSON, fallthrough to comma split
        }
        return imgs.split(',').map((s:string)=>s.trim()).filter(Boolean)
      }
    }

    // If it's a string, try several fallbacks
    if (typeof m === 'string') {
      // try to parse JSON string
      try {
        const p = JSON.parse(m)
        if (Array.isArray(p)) return p.filter(Boolean) as string[]
        if (p && 'images' in p && Array.isArray((p as Record<string, unknown>).images)) return ((p as Record<string, unknown>).images as string[]).filter(Boolean)
      } catch (e) {
        // not JSON
      }

      // extract http/https urls
      const urlRegex = /(https?:\/\/[^\s"']+)/g
      const matches = Array.from(m.matchAll(urlRegex)).map(x=>x[1])
      if (matches.length) return matches

      // comma-separated fallback and space-separated fallback
      const parts = m.split(/[,\n\s]+/).map((s:string)=>s.trim()).filter(Boolean)
      if (parts.length) return parts
    }

    return []
  }

  const imgs: string[] = normalizeImages(md)
  // If metadata didn't contain images, try listing objects in the bucket for this slug
  let allImgs = imgs.slice()
  if (allImgs.length === 0) {
    try {
      const bucket = process.env.NEXT_PUBLIC_S3_BUCKET
      if (bucket) {
        const minioClient = new Minio.Client({
          endPoint: process.env.MINIO_HOST || process.env.MINIO_ENDPOINT || process.env.AWS_S3_ENDPOINT || '127.0.0.1',
          port: Number(process.env.MINIO_PORT || process.env.MINIO_HTTP_PORT || 9000),
          useSSL: (process.env.MINIO_USE_SSL === 'true' || process.env.MINIO_USE_SSL === '1'),
          accessKey: process.env.MINIO_ACCESS_KEY || process.env.AWS_ACCESS_KEY_ID,
          secretKey: process.env.MINIO_SECRET_KEY || process.env.AWS_SECRET_ACCESS_KEY,
        })
        const prefix = `${process.env.S3_UPLOAD_PREFIX || 'projects/'}${slug}/`
        const objs: string[] = []
        const stream = minioClient.listObjectsV2(bucket, prefix, true)
        for await (const obj of stream) {
          if (obj && obj.name) objs.push(obj.name)
        }
        if (objs.length) allImgs = objs.map(k => buildPublicUrl(k))
      }
    } catch (e) {
      // listing failed; fall back to metadata images (empty)
    }
  }
  const mainImg = typeof project.image_path === 'string' ? project.image_path : undefined
  // If image_path is an object key (not an http(s) URL), proxy it through our uploads API
  const mainImgSrc = (() => {
    if (!mainImg) return mainImg
    try {
      // presigned URL detection
      if (typeof mainImg === 'string' && (mainImg.indexOf('X-Amz-Algorithm') !== -1 || mainImg.indexOf('minio') !== -1 || mainImg.indexOf('127.0.0.1') !== -1)) {
        try {
          const u = new URL(mainImg)
          let path = u.pathname.replace(/^\//, '')
          const bucket = process.env.NEXT_PUBLIC_S3_BUCKET
          if (bucket && path.startsWith(bucket + '/')) path = path.slice(bucket.length + 1)
          return buildPublicUrl(path)
        } catch (e) {
          return buildPublicUrl(mainImg)
        }
      }
      if (typeof mainImg === 'string' && (mainImg.startsWith('http') || mainImg.startsWith('/'))) return mainImg
      return buildPublicUrl(mainImg)
    } catch (e) { return mainImg }
  })()

  // sanitize metadata.details before rendering
  let detailsHtml: string | null = null
  try {
    if (md && (md as Record<string, unknown>).details) {
      const dom = new JSDOM('')
      const windowForPurify = dom.window as unknown as Window & typeof globalThis
      const DOMPurify = createDOMPurify(windowForPurify)
      detailsHtml = DOMPurify.sanitize(String((md as Record<string, unknown>).details))
    }
  } catch (e) {
    detailsHtml = md && (md as Record<string, unknown>).details ? String((md as Record<string, unknown>).details) : null
  }

  // sanitize description as a safety measure (server-side)
  let safeDescriptionHtml = ''
  try {
    const dom = new JSDOM('')
    const windowForPurify = dom.window as unknown as Window & typeof globalThis
    const DOMPurify = createDOMPurify(windowForPurify)
    safeDescriptionHtml = DOMPurify.sanitize(String(project.description || ''))
  } catch (e) {
    safeDescriptionHtml = String(project.description || '')
  }

  return (
    <main className={styles.container}>
      <Card title={String(project.title || '')} subtitle={String(project.subtitle || '')}>
        <div className={styles.content}>
          <div className={styles.media}>
            {project.slug === 'hotspot' ? (
              <HotspotGallery images={[ '/hotspot/hotspot-1.jpg', '/hotspot/hotspot-2.jpg', '/hotspot/hotspot-3.jpg' ]} />
            ) : (
              <>
                {mainImg ? <div className={styles.mainPhotoWrap}><img src={mainImgSrc} alt={String(project.title || '')} className={styles.mainPhoto} /></div> : null}
                <ProjectMediaWrapper images={allImgs.slice(0,6)} title={String(project.title || '')} />
              </>
            )}

            {typeof project.external_link === 'string' && project.external_link ? (
              <div className={styles.callout}>
                <a href={String(project.external_link)}>{String(project.external_link)}</a>
              </div>
            ) : null}
          </div>

          <div className={styles.story}>
            <div dangerouslySetInnerHTML={{ __html: safeDescriptionHtml }} />
            {detailsHtml ? <div style={{marginTop:20}} dangerouslySetInnerHTML={{ __html: detailsHtml }} /> : null}
            <p className="muted-small">
              <Link href="/projects">Back to Projects</Link>
            </p>
          </div>
        </div>
      </Card>
    </main>
  )
}
