"use client"
import React, { useState } from 'react';
import styles from './bands.module.css';

type ModeKey = 'fm' | 'dstar' | 'dmr' | null;

const Bands: React.FC = () => {
  const [open, setOpen] = useState<ModeKey>(null);

  const close = () => setOpen(null);

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
            <button className={`${styles.mode} ${styles.fm}`} onClick={() => setOpen('fm')}>
              <div className={styles.modeName}>FM</div>
              <div className={styles.modeDesc}>Analog voice & repeater work</div>
            </button>

            <button className={`${styles.mode} ${styles.dstar}`} onClick={() => setOpen('dstar')}>
              <div className={styles.modeName}>D-STAR</div>
              <div className={styles.modeDesc}>Digital voice/data protocol</div>
            </button>

            <button className={`${styles.mode} ${styles.dmp}`} onClick={() => setOpen('dmr')}>
              <div className={styles.modeName}>DMR</div>
              <div className={styles.modeDesc}>Digital mode (user-listed)</div>
            </button>
          </div>
        </div>
      </div>

      {open && (
        <div className={styles.modalOverlay} role="dialog" aria-modal="true">
          <div className={styles.modal}>
            <button className={styles.modalClose} onClick={close} aria-label="Close">×</button>
            {open === 'fm' && (
              <div>
                <h3>FM</h3>
                <section>
                  <h4 className={`${styles.sectionTitle} ${styles.sectionRepeater}`}>Repeaters</h4>
                  <ul>
                    <li>W8IRA</li>
                  </ul>
                </section>
              </div>
            )}

            {open === 'dstar' && (
              <div>
                <h3>D-STAR</h3>
                <section>
                  <h4 className={`${styles.sectionTitle} ${styles.sectionRepeater}`}>Repeaters</h4>
                  <ul>
                    <li>WM8TG</li>
                  </ul>
                </section>
                <section>
                  <h4 className={`${styles.sectionTitle} ${styles.sectionDstar}`}>Reflectors</h4>
                  <ul>
                    <li>REF001C</li>
                    <li>REF030C</li>
                    <li>REF035C</li>
                  </ul>
                </section>
              </div>
            )}

            {open === 'dmr' && (
              <div>
                <h3>DMR</h3>
                <section>
                  <h4 className={`${styles.sectionTitle} ${styles.sectionRepeater}`}>Repeaters</h4>
                  <ul>
                    <li>KD8RXD</li>
                  </ul>
                </section>

                <section>
                  <h4 className={`${styles.sectionTitle} ${styles.sectionNetwork}`}>Networks</h4>
                  <ul>
                    <li>BrandMeister — Talkgroup: 1</li>
                    <li>MI5 — Talkgroup: STATEWIDE1</li>
                  </ul>
                </section>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
};

export default Bands;