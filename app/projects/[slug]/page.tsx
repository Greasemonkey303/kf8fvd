import React from 'react'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { Card } from '@/components'
import ProjectMediaWrapper from '@/components/projects/ProjectMediaWrapper'
import * as Minio from 'minio'
import { buildPublicUrl } from '@/lib/s3'
import styles from '../hotspot/hotspot.module.css'
import { HotspotGallery } from '@/components'
import { query } from '@/lib/db'
import { sanitizeHtmlServer } from '@/lib/sanitize'
import { getHotspotGalleryUrls, replaceLegacyBundledImagePath, resolveManagedImageUrl } from '@/lib/siteMedia'

type Props = { params: { slug: string } | Promise<{ slug: string }> }

function stripHtml(html: string) {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

function buildProjectBullets(project: Record<string, unknown>, mediaCount: number, hasDetails: boolean) {
  const items: string[] = []
  const subtitle = String(project.subtitle || '').trim()
  if (subtitle) items.push(subtitle)
  items.push(mediaCount > 0 ? `${mediaCount} project image${mediaCount === 1 ? '' : 's'} available` : 'No gallery images attached yet')
  if (project.external_link) items.push('Includes an external reference link for parts, docs, or supporting material')
  if (hasDetails) items.push('Detailed notes are available below for deeper build context and follow-up work')
  return items
}

export default async function Page({ params }: Props) {
  const resolvedParams = (await params) as { slug: string }
  const { slug } = resolvedParams
  if (!slug) return notFound()

  const rows = (await query(
    'SELECT id, slug, title, subtitle, image_path, description, external_link, metadata, is_published FROM projects WHERE slug = ? LIMIT 1',
    [slug],
  )) as Array<Record<string, unknown>>
  const project = Array.isArray(rows) && rows[0] ? (rows[0] as Record<string, unknown>) : null
  if (!project) return notFound()

  const isPublished = project.is_published === true || project.is_published === 1 || project.is_published === '1'
  if (!isPublished) return notFound()

  let metadata: unknown = null
  try {
    metadata = project.metadata ? JSON.parse(String(project.metadata)) : null
  } catch {
    metadata = project.metadata
  }

  function normalizeImages(value: unknown): string[] {
    if (!value) return []
    if (Array.isArray(value)) return value.filter(Boolean).map((entry) => resolveManagedImageUrl(entry)).filter(Boolean) as string[]

    if (typeof value === 'object' && value !== null && 'images' in value) {
      const images = (value as Record<string, unknown>).images
      if (Array.isArray(images)) return images.filter(Boolean).map((entry) => resolveManagedImageUrl(entry)).filter(Boolean) as string[]
      if (typeof images === 'string') {
        try {
          const parsed = JSON.parse(images)
          if (Array.isArray(parsed)) return parsed.filter(Boolean).map((entry) => resolveManagedImageUrl(entry)).filter(Boolean) as string[]
        } catch {}
        return images.split(',').map((entry: string) => resolveManagedImageUrl(entry)).filter(Boolean)
      }
    }

    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value)
        if (Array.isArray(parsed)) return parsed.filter(Boolean).map((entry) => resolveManagedImageUrl(entry)).filter(Boolean)
        if (parsed && typeof parsed === 'object' && 'images' in parsed && Array.isArray((parsed as Record<string, unknown>).images)) {
          return ((parsed as Record<string, unknown>).images as string[]).filter(Boolean).map((entry) => resolveManagedImageUrl(entry)).filter(Boolean)
        }
      } catch {}

      const urlRegex = /(https?:\/\/[^\s"']+)/g
      const matches = Array.from(value.matchAll(urlRegex)).map((match) => match[1])
      if (matches.length) return matches.map((entry) => resolveManagedImageUrl(entry)).filter(Boolean)

      const parts = value.split(/[,\n\s]+/).map((entry: string) => resolveManagedImageUrl(entry)).filter(Boolean)
      if (parts.length) return parts
    }

    return []
  }

  const metadataImages = normalizeImages(metadata)
  let allImages = metadataImages.slice()
  if (allImages.length === 0) {
    try {
      const bucket = process.env.NEXT_PUBLIC_S3_BUCKET
      if (bucket) {
        const minioClient = new Minio.Client({
          endPoint: process.env.MINIO_HOST || process.env.MINIO_ENDPOINT || process.env.AWS_S3_ENDPOINT || '127.0.0.1',
          port: Number(process.env.MINIO_PORT || process.env.MINIO_HTTP_PORT || 9000),
          useSSL: process.env.MINIO_USE_SSL === 'true' || process.env.MINIO_USE_SSL === '1',
          accessKey: process.env.MINIO_ACCESS_KEY || process.env.AWS_ACCESS_KEY_ID,
          secretKey: process.env.MINIO_SECRET_KEY || process.env.AWS_SECRET_ACCESS_KEY,
        })
        const prefix = `${process.env.S3_UPLOAD_PREFIX || 'projects/'}${slug}/`
        const keys: string[] = []
        const stream = minioClient.listObjectsV2(bucket, prefix, true)
        for await (const obj of stream) {
          if (obj?.name) keys.push(obj.name)
        }
        if (keys.length) allImages = keys.map((key) => buildPublicUrl(key))
      }
    } catch {}
  }

  const mainImage = typeof project.image_path === 'string' ? project.image_path : undefined
  const mainImageSrc = (() => {
    if (!mainImage) return mainImage
    try {
      if (mainImage.includes('X-Amz-Algorithm') || mainImage.includes('minio') || mainImage.includes('127.0.0.1')) {
        try {
          const url = new URL(mainImage)
          let path = url.pathname.replace(/^\//, '')
          const bucket = process.env.NEXT_PUBLIC_S3_BUCKET
          if (bucket && path.startsWith(`${bucket}/`)) path = path.slice(bucket.length + 1)
          return buildPublicUrl(path)
        } catch {
          return buildPublicUrl(mainImage)
        }
      }
      if (mainImage.startsWith('http') || mainImage.startsWith('/')) return mainImage
      if (mainImage.startsWith('http')) return mainImage
      if (mainImage.startsWith('/')) return replaceLegacyBundledImagePath(mainImage)
      return buildPublicUrl(mainImage)
    } catch {
      return mainImage
    }
  })()

  let detailsHtml: string | null = null
  try {
    if (metadata && (metadata as Record<string, unknown>).details) {
      detailsHtml = sanitizeHtmlServer(String((metadata as Record<string, unknown>).details))
    }
  } catch {
    detailsHtml = metadata && (metadata as Record<string, unknown>).details ? String((metadata as Record<string, unknown>).details) : null
  }

  let safeDescriptionHtml = ''
  try {
    safeDescriptionHtml = sanitizeHtmlServer(String(project.description || ''))
  } catch {
    safeDescriptionHtml = String(project.description || '')
  }

  const summaryText = stripHtml(safeDescriptionHtml)
  const detailText = detailsHtml ? stripHtml(detailsHtml) : ''
  const galleryImages = Array.from(new Set([
    ...(mainImageSrc ? [String(mainImageSrc)] : []),
    ...allImages.map((image) => String(image)),
  ].filter(Boolean)))
  const mediaCount = galleryImages.length
  const projectBullets = buildProjectBullets(project, mediaCount, Boolean(detailsHtml))
  const focusCards = [
    {
      title: 'Build Summary',
      text: summaryText || 'A project summary will appear here when description content is added in the admin console.',
    },
    {
      title: 'Station Relevance',
      text: `This project sits inside the station workflow for KF8FVD, tying together hardware, operating notes, and the kind of practical work that supports day-to-day radio activity${project.external_link ? ' while linking out to the most useful reference material.' : '.'}`,
    },
    {
      title: 'Follow-up Notes',
      text: detailText || 'Long-form notes, tuning details, lessons learned, and future revisions can live in the details section for this project.',
    },
  ]

  return (
    <main className={styles.container}>
      <div className="page-intro" aria-labelledby="project-detail-title">
        <p className="page-kicker">Project Detail</p>
        <h1 id="project-detail-title" className="page-heading">{String(project.title || '')}</h1>
        <p className="page-deck">{String(project.subtitle || '') || 'Build notes, media, and operating context for this station project.'}</p>
      </div>

      <Card title="Project Overview" subtitle="Editorial build log">
        <div className={styles.editorialShell}>
          <section className={styles.summaryPanel}>
            <div className={styles.summaryHero}>
              <div className="eyebrow-row">
                <span className="signal-dot" aria-hidden></span>
                <span className={styles.sectionEyebrow}>Field notes</span>
              </div>
              <h2 className={styles.sectionHeading}>Built for real station use, not just display</h2>
              <p className={styles.sectionText}>{summaryText || 'This page is ready for a longer narrative once more project summary content is added.'}</p>
              <ul className={styles.quickList}>
                {projectBullets.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
            <div className={styles.focusGrid}>
              {focusCards.map((card) => (
                <article key={card.title} className={styles.focusCard}>
                  <h3 className={styles.focusTitle}>{card.title}</h3>
                  <p className={styles.focusText}>{card.text}</p>
                </article>
              ))}
            </div>
          </section>

          <div className={styles.content}>
            <div className={styles.media}>
              {project.slug === 'hotspot' ? (
                <HotspotGallery images={getHotspotGalleryUrls()} />
              ) : (
                <ProjectMediaWrapper images={galleryImages.slice(0, 8)} title={String(project.title || '')} />
              )}

              {typeof project.external_link === 'string' && project.external_link ? (
                <div className={styles.calloutBox}>
                  <span className={styles.calloutLabel}>Reference link</span>
                  <a href={String(project.external_link)}>{String(project.external_link)}</a>
                </div>
              ) : null}
            </div>

            <div className={styles.story}>
              <section className={styles.storySection}>
                <h3 className={styles.storyTitle}>Build Summary</h3>
                <div dangerouslySetInnerHTML={{ __html: safeDescriptionHtml }} />
              </section>
              {detailsHtml ? (
                <section className={styles.storySection}>
                  <h3 className={styles.storyTitle}>Detailed Notes</h3>
                  <div dangerouslySetInnerHTML={{ __html: detailsHtml }} />
                </section>
              ) : null}
              <section className={styles.storySection}>
                <h3 className={styles.storyTitle}>Project Context</h3>
                <p>This detail page is meant to read like a build log tied to a real ham radio station, with room for media, lessons learned, and future revisions instead of just a single block of text.</p>
              </section>
              <div className={styles.backLinkRow}>
                <Link href="/projects">Back to Projects</Link>
              </div>
            </div>
          </div>
        </div>
      </Card>
    </main>
  )
}
