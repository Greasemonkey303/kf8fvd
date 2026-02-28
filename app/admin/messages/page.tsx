import fs from 'fs/promises'
import styles from './page.module.css'

export default async function Page() {
  const out = './data/messages.log'
  let lines: string[] = []
  try {
    const text = await fs.readFile(out, 'utf8')
    lines = text.split('\n').filter(Boolean)
  } catch (e) {
    lines = []
  }

  const items = lines.map(l => {
    try { return JSON.parse(l) } catch { return { raw: l } }
  })

  return (
    <main className={styles.wrap}>
      <h1>Messages</h1>
      {items.length===0 && <p>No messages logged.</p>}
      {items.length>0 && (
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.th}>When</th>
              <th className={styles.th}>From</th>
              <th className={styles.th}>Email</th>
              <th className={styles.th}>Message</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it, idx) => (
              <tr key={idx}>
                <td className={styles.td}>{it.sentAt || '-'}</td>
                <td className={styles.td}>{it.name || it.raw || '-'}</td>
                <td className={styles.td}>{it.email || '-'}</td>
                <td className={styles.td}>{it.message ? it.message.substring(0,200) : '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  )
}
