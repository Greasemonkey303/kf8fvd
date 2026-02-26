import React from 'react';
import styles from './hero.module.css';

const Hero = () => {
  return (
    <section className={styles.hero}>
      <img className={styles.bg} src="/grand_rapids.jpg" alt="Downtown Grand Rapids" />
      <div className={styles.inner}>
        <h1>KF8FVD - Amateur Radio</h1>
        <p>Welcome to my ham radio site. Explore HF bands, equipment, and more.</p>
      </div>
    </section>
  );
};

export default Hero;