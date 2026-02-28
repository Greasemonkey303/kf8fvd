import React from 'react';
import Image from 'next/image'
import styles from './hero.module.css';

const Hero = () => {
  return (
    <section className={styles.hero} aria-labelledby="hero-title" role="region">
      <Image src="/grand_rapids.jpg" alt="Downtown Grand Rapids" fill className={styles.bg} priority sizes="(max-width: 900px) 100vw, 1400px" placeholder="blur" blurDataURL="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==" />
      <div className={styles.inner}>
        <h1 id="hero-title">KF8FVD - Amateur Radio</h1>
        <p className={styles.lead}>Welcome to my ham radio site. Explore HF bands, equipment, and more.</p>
        <div className={styles.heroCtaWrap}>
          <a href="/contactme" className={styles.heroBtn}>Contact Me</a>
          <div className={styles.heroNote}>Click to get in touch or schedule a QSO</div>
        </div>
      </div>
    </section>
  );
};

export default Hero;