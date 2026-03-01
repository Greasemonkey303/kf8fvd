import React from 'react'
import { notFound } from 'next/navigation'
import { Card } from '@/components'
import styles from '../hotspot/hotspot.module.css'
import { HotspotGallery } from '@/components'
import { query } from '@/lib/db'

type Props = { params: { slug: string } }

export default async function Page({ params }: Props){
  const { slug } = params
  const rows: any = await query('SELECT id, slug, title, subtitle, image_path, description, external_link, is_published FROM projects WHERE slug = ? LIMIT 1', [slug])
  const project = Array.isArray(rows) && rows[0] ? rows[0] : null
  if (!project) return notFound()

  // Only show unpublished projects to admins; public view requires published
  if (!project.is_published) return notFound()

  return (
    <main className={styles.container}>
      <Card title={project.title} subtitle={project.subtitle}>
        <div className={styles.content}>
          <div className={styles.media}>
            {project.slug === 'hotspot' ? (
              <HotspotGallery images={[ '/hotspot/hotspot-1.jpg', '/hotspot/hotspot-2.jpg', '/hotspot/hotspot-3.jpg' ]} />
            ) : (
              project.image_path ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={project.image_path} alt={project.title} className={styles.photo} />
              ) : null
            )}

            {project.external_link && (
              <div className={styles.callout}>
                <a href={project.external_link}>{project.external_link}</a>
              </div>
            )}
          </div>

          <div className={styles.story}>
            <div dangerouslySetInnerHTML={{ __html: project.description || '' }} />
            <p className="muted-small">
              <a href="/projects">Back to Projects</a>
            </p>
          </div>
        </div>
      </Card>
    </main>
  )
}
