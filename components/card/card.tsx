import React from 'react'
import styles from './card.module.css'

type Props = React.PropsWithChildren<{
  title?: string
  subtitle?: string
  className?: string
  id?: string
  ariaLabel?: string
}>

export default function Card({ title, subtitle, children, className = '', id, ariaLabel }: Props) {
  const titleId = id ? `${id}-title` : undefined
  return (
    <article id={id} aria-label={ariaLabel} className={`${styles.card} ${className}`}>
      {title && <h3 id={titleId} className={styles.title}>{title}</h3>}
      {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
      <div className={styles.body}>{children}</div>
    </article>
  )
}
