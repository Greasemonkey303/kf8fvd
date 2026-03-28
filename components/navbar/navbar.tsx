"use client"

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import styles from './navbar.module.css';
import Image from 'next/image';
import { signOut } from 'next-auth/react'
import { usePathname } from 'next/navigation';

const navItems = [
  { href: '/aboutme', label: 'About' },
  { href: '/projects', label: 'Projects' },
  { href: '/dx', label: 'DX' },
  { href: '/credentials', label: 'Credentials' },
  { href: '/contactme', label: 'Contact' },
]

const Navbar: React.FC = () => {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [isLight, setIsLight] = useState<boolean>(() => {
    try { return localStorage.getItem('kf8fvd-theme') === 'light' } catch { return false }
  });
  const [isAuth, setIsAuth] = useState(false);
  const [user, setUser] = useState<string | null>(null);
  const closeMenu = () => setOpen(false)

  useEffect(() => {
    const readAuth = async () => {
      try {
        const s = await fetch('/api/auth/session', { cache: 'no-store' })
        const session = await s.json().catch(() => null)
        const auth = !!session?.user
        setIsAuth(auth)
        setUser(session?.user?.name || session?.user?.email || null)
      } catch {
        setIsAuth(false)
        setUser(null)
      }
    }

    readAuth();
    const onStorage = () => readAuth();
    const onFocus = () => readAuth();
    window.addEventListener('storage', onStorage);
    window.addEventListener('focus', onFocus);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('focus', onFocus);
    };
  }, []);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 16)
    handleScroll()
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  useEffect(() => {
    try {
      if (isLight) document.documentElement.classList.add('theme-light')
      else document.documentElement.classList.remove('theme-light')
      localStorage.setItem('kf8fvd-theme', isLight ? 'light' : 'dark')
    } catch { }
  }, [isLight])

  useEffect(() => {
    if (!open) return undefined

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open])

  const isActive = (href: string) => pathname === href || (href !== '/' && pathname?.startsWith(`${href}/`))

  return (
    <header className={`${styles.header} ${scrolled ? styles.scrolled : ''}`}>
      <div className={styles.container}>
        <Link href="/" className={styles.brandLink} aria-label="KF8FVD home" onClick={closeMenu}>
          <div className={styles.brandPlate}>
            <Image src="/logo/navbar-logo.svg" alt="KF8FVD" className={styles.logo} width={420} height={168} priority />
          </div>
          <div className={styles.brandCopy}>
            <span className={styles.brandEyebrow}>Amateur Radio</span>
            <span className={styles.brandTitle}>KF8FVD</span>
          </div>
        </Link>

        <nav className={styles.navRail} aria-label="Primary">
          <div className={styles.navDesktop}>
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`${styles.navLink} ${isActive(item.href) ? styles.active : ''}`}
                aria-current={isActive(item.href) ? 'page' : undefined}
                onClick={closeMenu}
              >
                {item.label}
              </Link>
            ))}
          </div>
        </nav>

        <div className={styles.utilityCluster}>
          <div className={styles.themeSwitch}>
            <span className={styles.themeIcon} aria-hidden>
              <svg viewBox="0 0 24 24" aria-hidden focusable="false"><path d="M6.76 4.84l-1.8-1.79L3.17 4.84l1.79 1.8 1.8-1.8zM1 13h3v-2H1v2zm10-9h2V1h-2v3zm7.04 1.05l1.79-1.79-1.79-1.79-1.8 1.79 1.8 1.79zM17.24 19.16l1.8 1.79 1.79-1.79-1.8-1.8-1.79 1.8zM20 11v2h3v-2h-3zM12 20h2v3h-2v-3zM4.22 18.36l1.79 1.79 1.8-1.79-1.8-1.8-1.79 1.8zM12 6a6 6 0 100 12 6 6 0 000-12z" /></svg>
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={isLight}
              aria-label={isLight ? 'Switch to dark theme' : 'Switch to light theme'}
              className={`${styles.themeToggle} ${isLight ? styles.light : ''}`}
              onClick={() => setIsLight((current) => !current)}
            >
              <div className={styles.knob} aria-hidden />
            </button>
            <span className={styles.themeIcon} aria-hidden>
              <svg viewBox="0 0 24 24" aria-hidden focusable="false"><path d="M21.64 13a9 9 0 11-9.06-9.64 7 7 0 109.06 9.64z" /></svg>
            </span>
          </div>

          <div className={styles.authCluster}>
            {isAuth ? (
              <>
                <div className={styles.userBadge}>
                  <span className={styles.userLabel}>Signed in</span>
                  <span className={styles.userName}>{user ? user : 'Operator'}</span>
                </div>
                <Link href="/admin" className={styles.adminLink} onClick={closeMenu}>Admin</Link>
                <button onClick={() => { signOut({ callbackUrl: '/' }) }} className={styles.linkButton}>Log Out</button>
              </>
            ) : (
              <Link href="/signin" className={styles.signInLink} onClick={closeMenu}>Sign In</Link>
            )}
          </div>

          <button
            className={`${styles.toggle} ${open ? styles.toggleOpen : ''}`}
            aria-expanded={open}
            aria-label={open ? 'Close menu' : 'Open menu'}
            aria-controls="site-nav-mobile"
            onClick={() => setOpen((current) => !current)}
          >
            <span className={styles.toggleLine} />
            <span className={styles.toggleLine} />
            <span className={styles.toggleLine} />
          </button>
        </div>
      </div>

      <div className={`${styles.mobileShell} ${open ? styles.open : ''}`}>
        <nav id="site-nav-mobile" className={styles.mobilePanel} aria-label="Mobile navigation">
          <div className={styles.mobileHeading}>Navigation</div>
          <div className={styles.mobileLinks}>
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`${styles.mobileLink} ${isActive(item.href) ? styles.active : ''}`}
                aria-current={isActive(item.href) ? 'page' : undefined}
                onClick={closeMenu}
              >
                {item.label}
              </Link>
            ))}
          </div>
          <div className={styles.mobileMeta}>
            {isAuth ? (
              <>
                <div className={styles.mobileUserBlock}>
                  <span className={styles.userLabel}>Signed in</span>
                  <strong className={styles.mobileUserName}>{user ? user : 'Operator'}</strong>
                </div>
                <div className={styles.mobileActions}>
                  <Link href="/admin" className={styles.adminLink} onClick={closeMenu}>Admin</Link>
                  <button onClick={() => { signOut({ callbackUrl: '/' }) }} className={styles.linkButton}>Log Out</button>
                </div>
              </>
            ) : (
              <Link href="/signin" className={styles.signInLink} onClick={closeMenu}>Sign In</Link>
            )}
          </div>
        </nav>
      </div>
    </header>
  );
};

export default Navbar;