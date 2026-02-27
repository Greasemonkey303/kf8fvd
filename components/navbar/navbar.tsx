"use client"

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import styles from './navbar.module.css';

const Navbar: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [isAuth, setIsAuth] = useState(false);
  const [user, setUser] = useState<string | null>(null);

  useEffect(() => {
    const readAuth = () => {
      try {
        const auth = !!localStorage.getItem('kf8fvd_auth');
        const u = localStorage.getItem('kf8fvd_user');
        setIsAuth(auth);
        setUser(u);
      } catch (err) {
        setIsAuth(false);
        setUser(null);
      }
    };

    readAuth();
    const onStorage = () => readAuth();
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

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
          {isAuth ? (
            <>
              <span className={styles.user} aria-hidden>
                {user ? `Hi, ${user}` : 'You'}
              </span>
              <Link href="/logout">Log Out</Link>
            </>
          ) : (
            <Link href="/signin">Sign In</Link>
          )}
        </nav>
      </div>
    </header>
  );
};

export default Navbar;