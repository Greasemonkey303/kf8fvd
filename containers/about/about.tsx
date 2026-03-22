"use client"

import React, { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import styles from './about.module.css'
import { Card } from '@/components'
import createDOMPurify from 'dompurify'
import modalStyles from '@/components/modal/imageModal.module.css'
import { createPortal } from 'react-dom'
import { useEffect } from 'react'

type AboutCard = {
  title?: string
  subtitle?: string
  content?: string // raw HTML
  content_sanitized?: string | null
  image?: string
  templateSmall?: string
  templateLarge?: string
}

type AboutData = {
  summary?: { title?: string; text?: string; cta?: { label?: string; href?: string } }
  aboutCard?: AboutCard
  topologyCard?: AboutCard
  hamshackCard?: AboutCard
  cards?: AboutCard[]
}

type RawCard = {
  title?: unknown
  subtitle?: unknown
  content?: unknown
  content_sanitized?: string | null
  contentSanitized?: string | null
  image?: unknown
  templateSmall?: unknown
  templateLarge?: unknown
}

export default function About({ data }: { data?: AboutData }) {
  const [open, setOpen] = useState<string | null>(null)

  const purify = typeof window !== 'undefined' ? createDOMPurify(window as unknown as Window & typeof globalThis) : null
  if (purify && typeof purify.setConfig === 'function') purify.setConfig({ FORBID_TAGS: ['script', 'style'] })

  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null
    const btn = document.querySelector(`.${modalStyles.close}`) as HTMLButtonElement | null
    if (btn) btn.focus()
    const doc = document.documentElement
    const prevOverflow = doc.style.overflow || ''
    doc.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(null) }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      try { doc.style.overflow = prevOverflow || '' } catch {}
      if (prev && typeof prev.focus === 'function') prev.focus()
    }
  }, [open])

  // fallback defaults: use existing static copy when no data provided
  const summary = data?.summary ?? {
    title: 'Hi — I\'m Zachary (KF8FVD)',
    text: 'Technician-class ham operator in Kentwood, MI — radio, digital modes, and maker projects.',
    cta: { label: 'Contact Me', href: '/contactme' }
  }

  const aboutCard = data?.aboutCard ?? { title: '', subtitle: '', content: '', image: '' }
  const topologyCard = data?.topologyCard ?? { title: '', subtitle: '', content: '', image: '' }
  const hamshackCard = data?.hamshackCard ?? { title: '', subtitle: '', content: '', image: '' }

  // reference fallbacks to avoid unused-var ESLint warnings
  void aboutCard
  void topologyCard
  void hamshackCard

  // Prefer flexible `cards` array when provided; otherwise render no cards (admin controls cards exclusively)
  const rawCards = (data as unknown as { cards?: RawCard[] } | undefined)?.cards
  const cardsList: AboutCard[] = Array.isArray(rawCards) && rawCards.length > 0
    ? rawCards.map((c) => ({
        title: String(c?.title ?? ''),
        subtitle: String(c?.subtitle ?? ''),
        content: String(c?.content ?? ''),
        content_sanitized: c?.content_sanitized ?? c?.contentSanitized ?? null,
        image: String(c?.image ?? '/headshot.jpg'),
        templateSmall: String(c?.templateSmall ?? ''),
        templateLarge: String(c?.templateLarge ?? '')
      }))
    : []

  const getThumbProps = (card: AboutCard) => {
    const t = String(card?.templateSmall || '').toLowerCase()
    switch (t) {
      case 'avatar':
        return { width: 180, height: 180, className: `${styles.avatar} ${styles.avatarRound}` }
      case 'thumb':
        return { width: 140, height: 100, className: `${styles.avatar} ${styles.avatarThumb}` }
      case 'badge':
        return { width: 84, height: 84, className: `${styles.avatar} ${styles.avatarBadge}` }
      default:
        return { width: 180, height: 180, className: styles.avatar }
    }
  }

  return (
    <main className={styles.about}>
      <div className={styles.wrapper}>
        <div className={styles.summary} role="region" aria-labelledby="about-summary-title">
          <h2 id="about-summary-title">{summary.title}</h2>
          <p className={styles.summaryText}>{summary.text}</p>
          <div>
            <Link href={summary.cta?.href || '/contactme'} className={styles.ctaBtn}>{summary.cta?.label || 'Contact Me'}</Link>
          </div>
        </div>

        <h1 id="about-title" className={styles.visuallyHidden}>{cardsList[0]?.title || summary.title}</h1>

        {cardsList.map((card, idx) => (
          <Card key={idx} id={`about-card-${idx}`} title={card.title} subtitle={card.subtitle} className={styles.aboutCard} ariaLabel={card.title}>
            {idx === 0 ? (
              (() => {
                const tp = getThumbProps(card)
                const contentClass = (card?.templateSmall === 'badge') ? `${styles.content} ${styles.contentNarrow}` : ((card?.templateSmall === 'thumb') ? `${styles.content} ${styles.contentMedium}` : styles.content)
                return (
                  <div className={contentClass}>
                    {/* Use Next.js Image for optimization; fallback to unoptimized for data/blob URLs */}
                    <Image src={String(card.image || '/headshot.jpg')} alt={card.title || 'About'} width={tp.width} height={tp.height} className={tp.className} style={{objectFit:'cover', display:'block'}} unoptimized={String(card.image || '').startsWith('data:') || String(card.image || '').startsWith('blob:')} />
                    <div className={styles.copy}>
                      <div dangerouslySetInnerHTML={{ __html: (card.content_sanitized ?? (purify ? purify.sanitize(String(card.content || '')) : String(card.content || ''))) }} />
                    </div>
                  </div>
                )
              })()
            ) : (
              <div className={styles.topo}>
                <div className={styles.topoImage} onClick={() => setOpen(card.image || '/apts.jpg')} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setOpen(card.image || '/apts.jpg') }}>
                  <Image src={card.image || '/apts.jpg'} alt={card.title || ''} width={1200} height={700} className={styles.topoImg} loading="lazy" />
                  <div className={styles.imgHint} aria-hidden>Click image to view full screen</div>
                </div>
                <div className={styles.topoCopy}>
                  <div dangerouslySetInnerHTML={{ __html: (card.content_sanitized ?? (purify ? purify.sanitize(String(card.content || '')) : String(card.content || ''))) }} />
                </div>
              </div>
            )}
          </Card>
        ))}
      </div>
            {open && typeof document !== 'undefined' && createPortal(
        <div className={modalStyles.backdrop} onClick={() => setOpen(null)} role="dialog" aria-modal="true">
          <div className={modalStyles.sheet} onClick={(e) => e.stopPropagation()}>
            <button className={modalStyles.close} onClick={() => setOpen(null)} aria-label="Close image">✕</button>
            <Image src={open} alt="" width={1200} height={800} className={modalStyles.image} unoptimized={String(open).startsWith('data:') || String(open).startsWith('blob:')} />
          </div>
        </div>,
        document.body
      )}
    </main>
  )
}

