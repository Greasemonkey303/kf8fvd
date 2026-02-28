"use client"

import React, { useState } from 'react'
import Image from 'next/image'
import styles from './about.module.css'
import { Card } from '@/components'
import dynamic from 'next/dynamic'
const ImageModal = dynamic(() => import('@/components/modal/ImageModal'), { ssr: false })

export default function About() {
  const [open, setOpen] = useState<string | null>(null)

  return (
    <main className={styles.about}>
      <div className={styles.wrapper}>
        <h1 id="about-title" className={styles.visuallyHidden}>About Me</h1>
        <Card title="About Me" subtitle="KF8FVD" className={styles.aboutCard}>
          <div className={styles.content}>
              <Image src="/headshot.jpg" alt="Zachary (KF8FVD)" width={180} height={180} className={styles.avatar} priority />
            <div className={styles.copy}>
              <p className={styles.lead}>
                73 from KF8FVD! Thanks for stopping by my QRZ page! My name is Zachary, and I am
                operating out of Kentwood, Michigan (near Grand Rapids).
              </p>

              <h3>About Me</h3>
              <p>
                By day, I work as a CNC and EDM Specialist in the aerospace and automotive
                industries. I have a deep passion for precision machining and anything technical.
                When I’m not at the mill or the lathe, I’m usually at my workbench tinkering with
                electronics, 3D printing, or hobbyist networking.
              </p>

              <h3>The Shack &amp; Gear</h3>
              <p>
                I am currently a Technician class operator with a heavy focus on the intersection
                of traditional RF and modern digital modes. My current setup includes:
              </p>
              <ul>
                <li>Handhelds: Icom ID-52A PLUS and a Baofeng DM-32UV.</li>
                <li>
                  Digital Setup: Active on D-STAR and DMR. I recently built a custom duplex MMDVM
                  hotspot using a Raspberry Pi 4 running WPSD to stay connected globally from my
                  home office.
                </li>
              </ul>

              <h3>Current Projects &amp; Goals</h3>
              <p>
                I am actively studying for my General Class license and look forward to getting my
                first HF station on the air soon. Aside from radio, you can usually find me:
              </p>
              <ul>
                <li>Designing and printing parts on my Bambu Lab X1 Carbon (Blender / Shaper3D).</li>
                <li>Managing my home lab, including an Ubuntu server and Pi-hole for network-wide ad blocking.</li>
                <li>Building custom PCs and exploring new tech.</li>
              </ul>

              <h3>QSL Information</h3>
              <p>QRZ Logbook — updated regularly.</p>
              <p>eQSL — available.</p>

              <p>
                If we’ve just had a QSO via a reflector or local repeater, thanks for the contact! I
                look forward to catching you on the air again soon.
              </p>

              <p>73, Zachary (KF8FVD)</p>
            </div>
          </div>
        </Card>
        <Card title="Home Topology" subtitle="Hidden Lakes Apartments, Kentwood" className={styles.aboutCard}>
          <div className={styles.topo}>
            <div className={styles.topoImage} onClick={() => setOpen('/apts.jpg')} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setOpen('/apts.jpg') }}>
              <Image src="/apts.jpg" alt="Hidden Lakes Apartments - Kentwood" width={1200} height={700} className={styles.topoImg} />
              <div className={styles.imgHint} aria-hidden>Click image to view full screen</div>
            </div>
            <div className={styles.topoCopy}>
              <p className={styles.lead}>
                Home base: Hidden Lakes Apartments in Kentwood, Michigan — a comfortable suburban
                neighborhood just southeast of downtown Grand Rapids.
              </p>

              <p>
                The complex sits in a mixed residential and light-commercial area with mature trees,
                moderate building heights, and generally good line-of-sight toward the northwest
                where downtown Grand Rapids rises. Streets are laid out in a predictable grid and
                the immediate area provides convenient access to local services, grocery stores,
                and several parks.
              </p>

              <p>
                From an amateur radio perspective, the surroundings are typical suburban terrain —
                low- to mid-rise buildings, tree cover that can affect VHF/UHF in dense foliage,
                but generally friendly for handhelds and rooftop antennas with modest elevation.
                Nearby repeater coverage is strong toward downtown and higher elevations just
                beyond the city.
              </p>

              <ul>
                <li>Approx. 6–10 minute drive to central Grand Rapids for urban services.</li>
                <li>Several small parks and green corridors within walking distance.</li>
                <li>Easy access to major roads for quick travel to area repeaters and contest sites.</li>
                <li>Suburban tree cover may require higher mounting for reliable HF/VHF line-of-sight.</li>
              </ul>
            </div>
          </div>
        </Card>
        <Card title="Ham Shack" subtitle="Home Radio & Workshop" className={styles.aboutCard}>
          <div className={styles.topo}>
            <div className={styles.topoImage} onClick={() => setOpen('/hamshack.jpg')} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setOpen('/hamshack.jpg') }}>
              <Image src="/hamshack.jpg" alt="Ham Shack and workshop" width={1200} height={700} className={styles.topoImg} />
              <div className={styles.imgHint} aria-hidden>Click image to view full screen</div>
            </div>
            <div className={styles.topoCopy}>
              <p className={styles.lead}>
                My ham shack and workshop: a compact, well-organized space for radio, digital
                experimentation, and light fabrication.
              </p>

              <p>
                The primary bench hosts radios, hotspots, and a modest antenna tuner setup. My
                Bambu Lab X1-C Carbon 3D printer lives in the same area and is used for rapid
                prototyping of mounts, enclosures, and small mechanical parts. The system is
                integrated with my home network and printing workflow for easy remote prints.
              </p>

              <p>
                Network and core services are housed in a small rack located under the bench —
                this rack contains a switch, power distribution, and several Raspberry Pi devices
                used for hotspots and server-side tooling. Cable management is kept tidy to
                minimize RF interference and allow quick changes during testing.
              </p>

              <ul>
                <li>Bambu Lab X1-C Carbon for 3D-printed parts and prototyping.</li>
                <li>Small network rack under the bench with switch and Pi-based services.</li>
                <li>Under the TV: a Creality SpacePi X4 and a climate-controlled cabinet for filament storage.</li>
                <li>Dedicated bench for radio gear, hotspots, and tuning.</li>
                <li>Good ventilation and clearance for antenna experiments and printer use.</li>
              </ul>
            </div>
          </div>
        </Card>
      </div>
      <ImageModal src={open} alt="" onClose={() => setOpen(null)} />
    </main>
  )
}
