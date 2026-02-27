import React from 'react'
import styles from './about.module.css'
import { Card } from '@/components'

export default function About() {
  return (
    <main className={styles.about}>
      <div className={styles.wrapper}>
        <Card title="About Me" subtitle="KF8FVD">
          <div className={styles.content}>
            <img src="/avatar-placeholder.png" alt="Your picture" className={styles.avatar} />
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
              <p>QRZ Logbook: Updated regularly</p>
              <p>eQSL: Also available</p>

              <p>
                If we’ve just had a QSO via a reflector or local repeater, thanks for the contact! I
                look forward to catching you on the air again soon.
              </p>

              <p>73, Zachary (KF8FVD)</p>
            </div>
          </div>
        </Card>
      </div>
    </main>
  )
}
