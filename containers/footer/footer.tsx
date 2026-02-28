import React from 'react';
import styles from './footer.module.css';

const footer = () => {
  return (
    <footer className={styles.footer}>
      <div className={styles.inner}>
        <p>&copy; {new Date().getFullYear()} KF8FVD. All rights reserved.</p>
        <nav className={styles.links} aria-label="Footer">
          <a href="/privacy" className={styles.privacy}>Privacy</a>
        </nav>
      </div>
    </footer>
  );
};

export default footer;