import React from 'react';
import Link from 'next/link';
import styles from './navbar.module.css';

const navbar = () => {
  return (
    <header>
      <nav className={styles.navbar}>
        <Link href="/">Home</Link>
        <Link href="/aboutme">About Me</Link>
        <Link href="/projects">Projects</Link>
        <Link href="/contactme">Contact</Link>
      </nav>
    </header>
  );
};

export default navbar;