import React from 'react';
import styles from './bands.module.css';

const Bands: React.FC = () => {
  return (
    <section className={styles.bands} aria-labelledby="bands-title">
      <div className={styles.grid}>
        <div className={styles.card}>
          <h2 id="bands-title">Bands</h2>
          <p className={styles.lead}>Primary VHF / UHF bands I operate</p>
          <ul className={styles.list}>
            <li className={styles.item}>2m (144–148 MHz)</li>
            <li className={styles.item}>70cm (420–450 MHz)</li>
          </ul>
        </div>

        <div className={styles.card}>
          <h2>Modes</h2>
          <p className={styles.lead}>Common digital and analog modes I use</p>
          <div className={styles.modes}>
            <div className={`${styles.mode} ${styles.fm}`}>
              <div className={styles.modeName}>FM</div>
              <div className={styles.modeDesc}>Analog voice & repeater work</div>
            </div>

            <div className={`${styles.mode} ${styles.dstar}`}>
              <div className={styles.modeName}>D-STAR</div>
              <div className={styles.modeDesc}>Digital voice/data protocol</div>
            </div>

            <div className={`${styles.mode} ${styles.dmp}`}>
              <div className={styles.modeName}>DMP</div>
              <div className={styles.modeDesc}>Digital mode (user-listed)</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Bands;