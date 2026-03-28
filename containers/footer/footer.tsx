import React from 'react';
import styles from './footer.module.css';
import Image from 'next/image'

const footer = () => {
  return (
    <footer className={styles.footer}>
      <div className={styles.inner}>
        <div className={styles.brand}>
          <Image src="/logo/mini-logo.svg" alt="KF8FVD" className={styles.miniLogo} width={48} height={48} unoptimized />
          <p className={styles.copy}>&copy; {new Date().getFullYear()} KF8FVD. All rights reserved.</p>
        </div>
        <nav className={styles.links} aria-label="Footer">
          <a href="/privacy" className={styles.privacy}>Privacy</a>
        </nav>
      </div>
    </footer>
  );
};

export default footer;