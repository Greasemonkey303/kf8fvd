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
      <Image className={styles.sideLogo} src="/logo/navbar-logo.svg" alt="" width={280} height={80} priority aria-hidden />
      <Image className={styles.mainLogo} src="/logo/main-logo.svg" alt="KF8FVD" width={720} height={240} priority />
      <Image className={styles.sideLogo} src="/logo/mini-logo.svg" alt="" width={160} height={80} priority aria-hidden />
    </div>
  )
}

export default MainLogo
