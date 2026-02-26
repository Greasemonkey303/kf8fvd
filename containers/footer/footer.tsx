import React from 'react';
import styles from './footer.module.css';

const footer = () => {
  return (
    <footer className={styles.footer}>
      <p>&copy; {new Date().getFullYear()} KF8FVD. All rights reserved.</p>
    </footer>
  );
};

export default footer;