"use client"

import React, { useState } from 'react';
import Link from 'next/link';
import styles from './navbar.module.css';

const Navbar: React.FC = () => {
  const [open, setOpen] = useState(false);

  return (
    <header className={styles.header}>
      <div className={styles.container}>
        <div className={styles.brand}>
          <Link href="/">KF8FVD</Link>
        </div>

        <button
          className={styles.toggle}
          aria-expanded={open}
          aria-label={open ? 'Close menu' : 'Open menu'}
          onClick={() => setOpen((s) => !s)}
        >
          <span className={styles.hamburger} />
        </button>

        <nav className={`${styles.nav} ${open ? styles.open : ''}`} aria-hidden={!open && undefined}>
          <Link href="/aboutme">About Me</Link>
          <Link href="/projects">Projects</Link>
          <Link href="/dx">DX</Link>
          <Link href="/contactme">Contact</Link>
          <Link href="/credentials">Credentials</Link>
        </nav>
      </div>
    </header>
  );
};

export default Navbar;