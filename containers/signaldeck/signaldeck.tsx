import { HamRadioHeroScene } from '@/components'
import styles from './signaldeck.module.css'

export default function SignalDeck() {
  return (
    <section className={styles.section} aria-labelledby="signal-deck-title">
      <div className={styles.inner}>
        <div className={styles.header}>
          <p className={styles.kicker}>Three-dimensional station visual</p>
          <h2 id="signal-deck-title" className={styles.title}>Signal Deck</h2>
        </div>

        <div className={styles.stage}>
          <HamRadioHeroScene />
        </div>

        <div className={styles.meta} aria-label="Signal deck highlights">
          <div className={styles.metaItem}>
            <span className={styles.metaLabel}>Focus</span>
            <strong className={styles.metaValue}>HF, VHF, station builds</strong>
          </div>
          <div className={styles.metaItem}>
            <span className={styles.metaLabel}>Visual cues</span>
            <strong className={styles.metaValue}>Rig faceplate, mast, signal field</strong>
          </div>
          <div className={styles.metaItem}>
            <span className={styles.metaLabel}>Direction</span>
            <strong className={styles.metaValue}>Live shack energy, not generic tech</strong>
          </div>
        </div>
      </div>
    </section>
  )
}