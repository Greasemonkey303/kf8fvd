import React from 'react'
import Image from 'next/image'
import styles from './hero.module.css'

async function fetchHero() {
  try {
    const res = await fetch('/api/hero', { cache: 'no-store' })
    return await res.json()
  } catch (e) {
    return null
  }
}

export default async function Hero() {
  const data = await fetchHero()
  const hero = data?.hero || null
  const images = Array.isArray(data?.images) ? data.images : []
  const featured = images.find((i: any) => i.is_featured) || images[0] || null

  const imageSrc = featured ? (featured.url || '') : '/grand_rapids.jpg'
  const altText = featured?.alt || 'Hero image'

  return (
    <section className={styles.hero} aria-labelledby="hero-title" role="region">
      <Image src={imageSrc} alt={altText} fill className={styles.bg} priority sizes="(max-width: 900px) 100vw, 1400px" placeholder="blur" blurDataURL="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==" />
      <div className={styles.inner}>
        <h1 id="hero-title">{hero?.title || 'KF8FVD - Amateur Radio'}</h1>
        <p className={styles.lead}>{hero?.subtitle || 'Welcome to my ham radio site. Explore HF bands, equipment, and more.'}</p>
        <div className={styles.heroCtaWrap}>
          <a href="/contactme" className={styles.heroBtn}>Contact Me</a>
          <div className={styles.heroNote}>Click to get in touch or schedule a QSO</div>
        </div>
      </div>
    </section>
  )
}