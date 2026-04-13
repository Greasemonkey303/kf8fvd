import HamRadioHeroScene from '@/components/hero/HamRadioHeroScene'
import styles from './signaldeck.module.css'

export default function SignalDeck() {
  return (
    <section className={styles.section} aria-labelledby="signal-deck-title">
      <div className={styles.inner}>
        <div className={styles.header}>
          <p className={styles.kicker}>Three-dimensional station visual</p>
          <h2 id="signal-deck-title" className={styles.title}>Signal Deck</h2>
          <p className={styles.deck}>
            A live-rendered Three.js station scene built around the same shack themes as the site:
            HF operating, antenna work, handheld and mobile gear, and the constant chase for a cleaner signal.
          </p>
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