import React from 'react'
import { Card } from '@/components'
import styles from './hotspot.module.css'
import { HotspotGallery } from '@/components'

export default function Page(){
  return (
    <main className={styles.container}>
      <Card title="Hotspot Build" subtitle="Raspberry Pi 4 + MMDVM HAT">
        <div className={styles.content}>
          <div className={styles.media}>
            <HotspotGallery images={[ '/hotspot/hotspot-1.jpg', '/hotspot/hotspot-2.jpg', '/hotspot/hotspot-3.jpg' ]} />
            <div className={styles.callout}>Tap an image to enlarge — replace images in <code>/public</code>.</div>
          </div>

          <div className={styles.story}>
            <h4>How I put it together</h4>
            <p>I wanted a compact, reliable hotspot for local digital modes. I chose a Raspberry Pi 4 for its performance and an MMDVM HAT to provide multi-mode digital voice support. The assembly steps were straightforward: mount the HAT on the Pi, configure the software, tuck everything into a compact case, and wire the antenna connector.</p>

            <h4>Steps</h4>
            <ol>
              <li>Install Raspberry Pi OS and update packages.</li>
              <li>Attach the MMDVM HAT carefully to the GPIO pins and secure with standoffs.</li>
              <li>Install MMDVMHost / hotspot firmware and configure the modem settings.</li>
              <li>Fit into the case, ensuring ventilation and access to the SMA connector.</li>
              <li>Power up, connect to your network, and test with a handheld or mobile hotspot client.</li>
            </ol>

            <h4>Hardware & Links</h4>
            <ul>
              <li>Pi 4 — <a href="https://www.amazon.com/dp/B07TYK4RL8?ref=ppx_yo2ov_dt_b_fed_asin_title&th=1" target="_blank" rel="noopener noreferrer">Amazon: Pi 4</a></li>
              <li>MMDVM HAT — <a href="https://www.amazon.com/dp/B0F6MNBQVL?ref=ppx_yo2ov_dt_b_fed_asin_title" target="_blank" rel="noopener noreferrer">Amazon: MMDVM HAT</a></li>
              <li>Case / Mount — <a href="https://www.amazon.com/dp/B0B87BPQ6G?ref=ppx_yo2ov_dt_b_fed_asin_title" target="_blank" rel="noopener noreferrer">Amazon: Case</a></li>
              <li>Antenna / SMA — <a href="https://www.amazon.com/dp/B0D6J9TD4P?ref=ppx_yo2ov_dt_b_fed_asin_title&th=1" target="_blank" rel="noopener noreferrer">Amazon: Antenna</a></li>
            </ul>

            <h4>Resources</h4>
            <ul>
              <li>W0CHP WPSD — <a href="https://w0chp.radio/wpsd/" target="_blank" rel="noopener noreferrer">W0CHP WPSD</a></li>
            </ul>

            <p className="muted-small">
              Disclaimer: these are not affiliate links and I do not make any money from purchases.
            </p>

            <h4>Software</h4>
            <ul>
              <li>WPSD — <a href="https://w0chp.radio/wpsd/" target="_blank" rel="noopener noreferrer">WPSD</a></li>
              <li>Pi-Star downloads — <a href="https://www.pistar.uk/downloads/" target="_blank" rel="noopener noreferrer">Pi-Star</a> (WPSD runs off the base Pi-Star; Pi-Star includes an older bundled version)</li>
              <li>Configuration snapshot — leave room here for paste or download (coming soon)</li>
            </ul>

            <h4>Notes</h4>
            <p>There is space above for a larger photo or a gallery — replace <code>/public/hotspot-placeholder.png</code> with your own image. All links are placeholders so you can update them with the exact products and software you used. The styling follows the site theme and keeps the card-based layout for consistency.</p>

          </div>
        </div>
      </Card>
    </main>
  )
}
