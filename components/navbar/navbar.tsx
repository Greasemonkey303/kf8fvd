"use client"

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import styles from './navbar.module.css';
import Image from 'next/image';
import useAdmin from '@/components/hooks/useAdmin'
import { signIn, signOut } from 'next-auth/react'

const Navbar: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [isAuth, setIsAuth] = useState(false);
  const [user, setUser] = useState<string | null>(null);
  const { isAdmin, user: adminUser, loading: adminLoading } = useAdmin()

  useEffect(() => {
    const readAuth = async () => {
      try {
        const s = await fetch('/api/auth/session')
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

  return (
    <header className={styles.header}>
      <div className={styles.container}>
        <div className={styles.brand}>
          <Link href="/">
            <Image src="/logo/navbar-logo.svg" alt="KF8FVD" className={styles.logo} width={420} height={168} priority />
          </Link>
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
              {isAdmin ? <Link href="/admin">Admin</Link> : null}
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