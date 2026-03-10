const fs = require('fs')
const path = require('path')
const mysql = require('mysql2/promise')
const bcrypt = require('bcryptjs')

async function main(){
  try {
    const [,, email, password] = process.argv
    if (!email || !password) {
      console.error('Usage: node scripts/set_user_password.js <email> <newPassword>')
      process.exit(2)
    }

    const envPath = path.join(process.cwd(), '.env.local')
    let env = {}
    if (fs.existsSync(envPath)){
      const txt = fs.readFileSync(envPath, 'utf8')
      txt.split(/\r?\n/).forEach(line => {
        const t = line.trim()
        if (!t || t.startsWith('#')) return
        const idx = t.indexOf('=')
        if (idx === -1) return
        const key = t.slice(0, idx).trim()
        let val = t.slice(idx+1)
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1,-1)
        env[key] = val
      })
    }

    const host = env.DB_HOST || process.env.DB_HOST || 'localhost'
    const port = parseInt(env.DB_PORT || process.env.DB_PORT || '3306')
    const user = env.DB_USER || process.env.DB_USER
    const passwordDb = env.DB_PASSWORD || process.env.DB_PASSWORD
    const database = env.DB_NAME || process.env.DB_NAME

    if (!user || !database) {
      console.error('DB_USER or DB_NAME not set in .env.local or environment')
      process.exit(2)
    }

    const conn = await mysql.createConnection({ host, port, user, password: passwordDb, database })
    const hash = await bcrypt.hash(password, 10)
    console.log('Updating password for', email)
    const [res] = await conn.execute('UPDATE users SET hashed_password = ? WHERE email = ?', [hash, email])
    console.log('Update result:', res && res.affectedRows)
    await conn.end()
    process.exit(0)
  } catch (err) {
    console.error('Error:', err)
    process.exit(1)
  }
}

main()
