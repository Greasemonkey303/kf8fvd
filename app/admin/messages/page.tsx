import fs from 'fs/promises'

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
    <main style={{padding:20}}>
      <h1>Messages</h1>
      {items.length===0 && <p>No messages logged.</p>}
      {items.length>0 && (
        <table style={{width:'100%',borderCollapse:'collapse'}}>
          <thead>
            <tr>
              <th style={{textAlign:'left',padding:8,borderBottom:'1px solid #ddd'}}>When</th>
              <th style={{textAlign:'left',padding:8,borderBottom:'1px solid #ddd'}}>From</th>
              <th style={{textAlign:'left',padding:8,borderBottom:'1px solid #ddd'}}>Email</th>
              <th style={{textAlign:'left',padding:8,borderBottom:'1px solid #ddd'}}>Message</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it, idx) => (
              <tr key={idx}>
                <td style={{padding:8,borderBottom:'1px solid #eee'}}>{it.sentAt || '-'}</td>
                <td style={{padding:8,borderBottom:'1px solid #eee'}}>{it.name || it.raw || '-'}</td>
                <td style={{padding:8,borderBottom:'1px solid #eee'}}>{it.email || '-'}</td>
                <td style={{padding:8,borderBottom:'1px solid #eee'}}>{it.message ? it.message.substring(0,200) : '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  )
}
