import React from 'react';
import styles from './footer.module.css';

const footer = () => {
  return (
    <footer className={styles.footer}>
      <div className={styles.inner}>
        <div style={{display:'flex', alignItems:'center', gap:12}}>
          <img src="/logo/mini-logo.svg" alt="KF8FVD" className={styles.miniLogo} />
          <p style={{margin:0}}>&copy; {new Date().getFullYear()} KF8FVD. All rights reserved.</p>
        </div>
        <nav className={styles.links} aria-label="Footer">
          <a href="/privacy" className={styles.privacy}>Privacy</a>
        </nav>
      </div>
    </footer>
  );
};

export default footer;