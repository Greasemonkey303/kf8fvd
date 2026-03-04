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

  const aboutCard = data?.aboutCard ?? {
    title: 'About Me',
    subtitle: 'KF8FVD',
    content: `<p class="${styles.lead}">73 from KF8FVD! Thanks for stopping by my QRZ page! My name is Zachary, and I am operating out of Kentwood, Michigan (near Grand Rapids).</p>
      <h3>About Me</h3>
      <p>By day, I work as a CNC and EDM Specialist in the aerospace and automotive industries. I have a deep passion for precision machining and anything technical. When I\'m not at the mill or the lathe, I\'m usually at my workbench tinkering with electronics, 3D printing, or hobbyist networking.</p>
      <h3>The Shack &amp; Gear</h3>
      <p>I am currently a Technician class operator with a heavy focus on the intersection of traditional RF and modern digital modes. My current setup includes:</p>
      <ul><li>Handhelds: Icom ID-52A PLUS and a Baofeng DM-32UV.</li><li>Digital Setup: Active on D-STAR and DMR. I recently built a custom duplex MMDVM hotspot using a Raspberry Pi 4 running WPSD to stay connected globally from my home office.</li></ul>
      <h3>Current Projects &amp; Goals</h3>
      <p>I am actively studying for my General Class license and look forward to getting my first HF station on the air soon. Aside from radio, you can usually find me:</p>
      <ul><li>Designing and printing parts on my Bambu Lab X1-C Carbon (Blender / Shaper3D).</li><li>Managing my home lab, including an Ubuntu server and Pi-hole for network-wide ad blocking.</li><li>Building custom PCs and exploring new tech.</li></ul>
      <h3>QSL Information</h3>
      <p>QRZ Logbook — updated regularly. eQSL — available.</p>
      <p>If we\'ve just had a QSO via a reflector or local repeater, thanks for the contact! I look forward to catching you on the air again soon.</p>
      <p>73, Zachary (KF8FVD)</p>`,
    image: '/headshot.jpg'
  }

  const topologyCard = data?.topologyCard ?? { title: 'Home Topology', subtitle: 'Hidden Lakes Apartments, Kentwood', content: '', image: '/apts.jpg' }
  const hamshackCard = data?.hamshackCard ?? { title: 'Ham Shack', subtitle: 'Home Radio & Workshop', content: '', image: '/hamshack.jpg' }

  // Prefer flexible `cards` array when provided; otherwise fall back to legacy three-card structure
  const cardsList: AboutCard[] = Array.isArray((data as any)?.cards) && (data as any).cards.length > 0
    ? (data as any).cards.map((c: any) => ({
        title: c?.title || '',
        subtitle: c?.subtitle || '',
        content: String(c?.content || ''),
        image: c?.image || '/headshot.jpg'
      }))
    : [aboutCard, topologyCard, hamshackCard]

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

        <h1 id="about-title" className={styles.visuallyHidden}>{cardsList[0]?.title || aboutCard.title}</h1>

        {cardsList.map((card, idx) => (
          <Card key={idx} id={`about-card-${idx}`} title={card.title} subtitle={card.subtitle} className={styles.aboutCard} ariaLabel={card.title}>
            {idx === 0 ? (
              <div className={styles.content}>
                <Image src={card.image || '/headshot.jpg'} alt={card.title || 'About'} width={180} height={180} className={styles.avatar} priority />
                <div className={styles.copy}>
                  <div dangerouslySetInnerHTML={{ __html: String(card.content || '') }} />
                </div>
              </div>
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

