"use client"

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import styles from './navbar.module.css';
import Image from 'next/image';
import { signOut } from 'next-auth/react'

const Navbar: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [isLight, setIsLight] = useState<boolean>(() => {
    try { return localStorage.getItem('kf8fvd-theme') === 'light' } catch { return false }
  });
  const [isAuth, setIsAuth] = useState(false);
  const [user, setUser] = useState<string | null>(null);

  useEffect(() => {
    const readAuth = async () => {
      try {
        const s = await fetch('/api/auth/session', { cache: 'no-store' })
        const session = await s.json().catch(()=>null)
        const auth = !!session?.user
        setIsAuth(auth)
        setUser(session?.user?.name || session?.user?.email || null)
      } catch (err) {
        setIsAuth(false)
        setUser(null)
      }
    }

    readAuth();
    const onStorage = () => readAuth();
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  useEffect(() => {
    try {
      if (isLight) document.documentElement.classList.add('theme-light')
      else document.documentElement.classList.remove('theme-light')
      localStorage.setItem('kf8fvd-theme', isLight ? 'light' : 'dark')
    } catch { }
  }, [isLight])

  return (
    <header className={styles.header}>
      <div className={styles.container}>
        <div className={styles.brand}>
          <Link href="/">
            <Image src="/logo/navbar-logo.svg" alt="KF8FVD" className={styles.logo} width={420} height={168} priority />
          </Link>
        </div>

        <div className={styles.themeSwitch}>
          <span className={styles.themeIcon} aria-hidden>
            <svg viewBox="0 0 24 24" aria-hidden focusable="false"><path d="M6.76 4.84l-1.8-1.79L3.17 4.84l1.79 1.8 1.8-1.8zM1 13h3v-2H1v2zm10-9h2V1h-2v3zm7.04 1.05l1.79-1.79-1.79-1.79-1.8 1.79 1.8 1.79zM17.24 19.16l1.8 1.79 1.79-1.79-1.8-1.8-1.79 1.8zM20 11v2h3v-2h-3zM12 20h2v3h-2v-3zM4.22 18.36l1.79 1.79 1.8-1.79-1.8-1.8-1.79 1.8zM12 6a6 6 0 100 12 6 6 0 000-12z"/></svg>
          </span>
          <div
            role="switch"
            tabIndex={0}
            aria-checked={isLight}
            className={`${styles.themeToggle} ${isLight ? styles.light : ''}`}
            onClick={() => {
              const next = !isLight;
              setIsLight(next);
            }}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); (e.target as HTMLElement).click(); } }}
          >
            <div className={styles.knob} aria-hidden />
          </div>
          <span className={styles.themeIcon} aria-hidden>
            <svg viewBox="0 0 24 24" aria-hidden focusable="false"><path d="M21.64 13a9 9 0 11-9.06-9.64 7 7 0 109.06 9.64z"/></svg>
          </span>
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
              <div className={styles.userCluster}>
                <span className={styles.user} aria-hidden>
                  {user ? `Hi, ${user}` : 'You'}
                </span>
                <Link href="/admin" className={styles.adminLink}>Admin</Link>
              </div>
              <button onClick={() => { signOut({ callbackUrl: '/' }) }} className={styles.linkButton}>Log Out</button>
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