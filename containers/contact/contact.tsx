import React from 'react'
import styles from './contact.module.css'
import { Card } from '@/components'

export default function Contact() {
  return (
    <main className={styles.contact}>
      <div className={styles.wrapper}>
        <Card title="Contact" subtitle="Get in touch">
          <div className={styles.inner}>
            <form className={styles.form}>
              <label>
                Name
                <input placeholder="Your name" />
              </label>
              <label>
                Email
                <input placeholder="you@example.com" />
              </label>
              <label>
                Message
                <textarea placeholder="Message" />
              </label>
              <div className={styles.actions}>
                <button type="button">Send</button>
                <a href="/credentials">View Credentials</a>
              </div>
            </form>
            <div className={styles.contactInfo}>
              <p>Prefer email? zach@example.com</p>
            </div>
          </div>
        </Card>
      </div>
    </main>
  )
}
