import React from 'react'
import { Card } from '@/components'
import styles from './hotspot.module.css'
import { HotspotGallery } from '@/components'

export default function Page(){
  const hardwareLinks = [
    { label: 'Pi 4', href: 'https://www.amazon.com/dp/B07TYK4RL8?ref=ppx_yo2ov_dt_b_fed_asin_title&th=1' },
    { label: 'MMDVM HAT', href: 'https://www.amazon.com/dp/B0F6MNBQVL?ref=ppx_yo2ov_dt_b_fed_asin_title' },
    { label: 'Case', href: 'https://www.amazon.com/dp/B0B87BPQ6G?ref=ppx_yo2ov_dt_b_fed_asin_title' },
    { label: 'Antenna', href: 'https://www.amazon.com/dp/B0D6J9TD4P?ref=ppx_yo2ov_dt_b_fed_asin_title&th=1' },
  ]

  return (
    <main className={styles.container}>
      <div className="page-intro" aria-labelledby="hotspot-page-title">
        <p className="page-kicker">Project Detail</p>
        <h1 id="hotspot-page-title" className="page-heading">Hotspot build log and parts reference</h1>
        <p className="page-deck">A compact Raspberry Pi 4 and MMDVM hotspot setup, including the hardware list, assembly notes, and reference links used to get it on the air.</p>
      </div>
      <Card title="Build Notes" subtitle="Raspberry Pi 4 + MMDVM HAT">
        <div className={styles.editorialShell}>
          <section className={styles.summaryPanel}>
            <div className={styles.summaryHero}>
              <div className="eyebrow-row">
                <span className="signal-dot" aria-hidden></span>
                <span className={styles.sectionEyebrow}>Field build</span>
              </div>
              <h2 className={styles.sectionHeading}>A compact digital hotspot built for practical station use</h2>
              <p className={styles.sectionText}>This build combines a Raspberry Pi 4 with an MMDVM HAT so local digital voice access stays simple, portable, and easy to maintain from the shack or the bench.</p>
              <ul className={styles.quickList}>
                <li>Portable hotspot footprint with room for upgrades and better cabling later.</li>
                <li>Focused on reliable local digital voice use instead of a one-off test build.</li>
                <li>Backed by a parts list, software references, and assembly notes in one place.</li>
              </ul>
            </div>
            <div className={styles.focusGrid}>
              <article className={styles.focusCard}>
                <h3 className={styles.focusTitle}>Why This Build</h3>
                <p className={styles.focusText}>A hotspot like this adds dependable access to digital modes without needing a large station footprint, which makes it a practical project for day-to-day use.</p>
              </article>
              <article className={styles.focusCard}>
                <h3 className={styles.focusTitle}>What It Supports</h3>
                <p className={styles.focusText}>FM, DMR, D-STAR, and related experimentation all benefit from a compact node that can live permanently on the network or move as needed.</p>
              </article>
              <article className={styles.focusCard}>
                <h3 className={styles.focusTitle}>Next Revision</h3>
                <p className={styles.focusText}>Future upgrades can focus on cable routing, thermal cleanup, cleaner case fitment, and a saved configuration snapshot for quick rebuilds.</p>
              </article>
            </div>
          </section>

          <div className={styles.content}>
          <div className={styles.media}>
            <HotspotGallery images={[ '/hotspot/hotspot-1.jpg', '/hotspot/hotspot-2.jpg', '/hotspot/hotspot-3.jpg' ]} />
            <div className={styles.calloutBox}>Tap an image to enlarge and compare the packaging, cabling, and final assembly layout.</div>
            <div className={styles.calloutBox}>
              <span className={styles.calloutLabel}>Parts used</span>
              <ul className={styles.linkList}>
                {hardwareLinks.map((item) => (
                  <li key={item.href}><a href={item.href} target="_blank" rel="noopener noreferrer">{item.label}</a></li>
                ))}
              </ul>
            </div>
          </div>

          <div className={styles.story}>
            <section className={styles.storySection}>
            <h4 className={styles.storyTitle}>How I put it together</h4>
            <p>I wanted a compact, reliable hotspot for local digital modes. I chose a Raspberry Pi 4 for its performance and an MMDVM HAT to provide multi-mode digital voice support. The assembly steps were straightforward: mount the HAT on the Pi, configure the software, tuck everything into a compact case, and wire the antenna connector.</p>
            </section>

            <section className={styles.storySection}>
            <h4 className={styles.storyTitle}>Steps</h4>
            <ol>
              <li>Install Raspberry Pi OS and update packages.</li>
              <li>Attach the MMDVM HAT carefully to the GPIO pins and secure with standoffs.</li>
              <li>Install MMDVMHost / hotspot firmware and configure the modem settings.</li>
              <li>Fit into the case, ensuring ventilation and access to the SMA connector.</li>
              <li>Power up, connect to your network, and test with a handheld or mobile hotspot client.</li>
            </ol>
            </section>

            <section className={styles.storySection}>
            <h4 className={styles.storyTitle}>Hardware & Links</h4>
            <ul>
              <li>Pi 4 — <a href="https://www.amazon.com/dp/B07TYK4RL8?ref=ppx_yo2ov_dt_b_fed_asin_title&th=1" target="_blank" rel="noopener noreferrer">Amazon: Pi 4</a></li>
              <li>MMDVM HAT — <a href="https://www.amazon.com/dp/B0F6MNBQVL?ref=ppx_yo2ov_dt_b_fed_asin_title" target="_blank" rel="noopener noreferrer">Amazon: MMDVM HAT</a></li>
              <li>Case / Mount — <a href="https://www.amazon.com/dp/B0B87BPQ6G?ref=ppx_yo2ov_dt_b_fed_asin_title" target="_blank" rel="noopener noreferrer">Amazon: Case</a></li>
              <li>Antenna / SMA — <a href="https://www.amazon.com/dp/B0D6J9TD4P?ref=ppx_yo2ov_dt_b_fed_asin_title&th=1" target="_blank" rel="noopener noreferrer">Amazon: Antenna</a></li>
            </ul>
            </section>

            <section className={styles.storySection}>
            <h4 className={styles.storyTitle}>Resources</h4>
            <ul>
              <li>W0CHP WPSD — <a href="https://w0chp.radio/wpsd/" target="_blank" rel="noopener noreferrer">W0CHP WPSD</a></li>
            </ul>
            </section>

            <p className="muted-small">
              Disclaimer: these are not affiliate links and I do not make any money from purchases.
            </p>

            <section className={styles.storySection}>
            <h4 className={styles.storyTitle}>Software</h4>
            <ul>
              <li>WPSD — <a href="https://w0chp.radio/wpsd/" target="_blank" rel="noopener noreferrer">WPSD</a></li>
              <li>Pi-Star downloads — <a href="https://www.pistar.uk/downloads/" target="_blank" rel="noopener noreferrer">Pi-Star</a> (WPSD runs off the base Pi-Star; Pi-Star includes an older bundled version)</li>
              <li>Configuration snapshot — leave room here for paste or download (coming soon)</li>
            </ul>
            </section>

            <section className={styles.storySection}>
            <h4 className={styles.storyTitle}>Notes</h4>
            <p>There is space above for a larger photo or a gallery — replace <code>/public/hotspot-placeholder.png</code> with your own image. All links are placeholders so you can update them with the exact products and software you used. The styling follows the site theme and keeps the card-based layout for consistency.</p>
            </section>

            <section className={styles.storySection}>
              <h4 className={styles.storyTitle}>Lessons Learned</h4>
              <p>Projects like this work best when the page documents the reasoning behind the build, the exact parts used, and what should be cleaned up on the next revision. That makes the page more useful later than a simple gallery or link list.</p>
            </section>

          </div>
        </div>
        </div>
      </Card>
    </main>
  )
}
