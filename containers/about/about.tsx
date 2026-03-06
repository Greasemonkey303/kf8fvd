"use client"

import React, { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import styles from './about.module.css'
import { Card } from '@/components'
import modalStyles from '@/components/modal/imageModal.module.css'
import { createPortal } from 'react-dom'
import { useEffect } from 'react'

type AboutCard = {
  title?: string
  subtitle?: string
  content?: string // sanitized HTML
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

export default function About({ data }: { data?: AboutData }) {
  const [open, setOpen] = useState<string | null>(null)

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

  // Prefer flexible `cards` array when provided; otherwise render no cards (admin controls cards exclusively)
  const cardsList: AboutCard[] = Array.isArray((data as any)?.cards) && (data as any).cards.length > 0
    ? (data as any).cards.map((c: any) => ({
        title: c?.title || '',
        subtitle: c?.subtitle || '',
        content: String(c?.content || ''),
        image: c?.image || '/headshot.jpg',
        templateSmall: c?.templateSmall || '',
        templateLarge: c?.templateLarge || ''
      }))
    : []

  const getThumbProps = (card: any) => {
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
                    {/* Use plain <img> so CSS controls sizing */}
                    <img src={String(card.image || '/headshot.jpg')} alt={card.title || 'About'} className={tp.className} style={{objectFit:'cover', display:'block'}} />
                    <div className={styles.copy}>
                      <div dangerouslySetInnerHTML={{ __html: String(card.content || '') }} />
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
                  <div dangerouslySetInnerHTML={{ __html: String(card.content || '') }} />
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
            <img src={open} alt="" className={modalStyles.image} />
          </div>
        </div>,
        document.body
      )}
    </main>
  )
}

