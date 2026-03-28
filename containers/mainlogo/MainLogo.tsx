import React from 'react'
import Image from 'next/image'
import styles from './MainLogo.module.css'

type Variant = 'subtle' | 'pulse' | 'spin' | 'none'

interface MainLogoProps {
  variant?: Variant
}

const MainLogo: React.FC<MainLogoProps> = ({ variant = 'subtle' }) => {
  const variantClass =
    variant === 'pulse' ? styles.animatePulse : variant === 'spin' ? styles.animateSpin : variant === 'none' ? styles.noAnimation : styles.animateSubtle

  return (
    <div className={`${styles.wrapper} ${variantClass}`} role="img" aria-label="KF8FVD logos">
      <span className={styles.logoItem} aria-hidden>
        <Image className={styles.sideLogo} src="/logo/navbar-logo.svg" alt="" width={280} height={80} sizes="(max-width: 640px) 60px, (max-width: 1024px) 108px, 164px" />
      </span>
      <span className={styles.logoItemMain} aria-hidden>
        <Image className={styles.mainLogo} src="/logo/main-logo.svg" alt="KF8FVD" width={720} height={240} sizes="(max-width: 640px) 210px, (max-width: 1024px) 340px, 460px" />
      </span>
      <span className={styles.logoItem} aria-hidden>
        <Image className={styles.sideLogo} src="/logo/mini-logo.svg" alt="" width={160} height={80} sizes="(max-width: 640px) 60px, (max-width: 1024px) 108px, 164px" />
      </span>
    </div>
  )
}

export default MainLogo
