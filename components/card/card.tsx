import React from 'react'
import styles from './card.module.css'

type Props = React.PropsWithChildren<{
  title?: string
  subtitle?: string
  className?: string
}>

export default function Card({ title, subtitle, children, className = '' }: Props) {
  return (
    <article className={`${styles.card} ${className}`}>
      {title && <h3 className={styles.title}>{title}</h3>}
      {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
      <div className={styles.body}>{children}</div>
    </article>
  )
}
