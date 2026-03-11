const fs = require('fs')
const path = require('path')
const mysql = require('mysql2/promise')

async function main(){
  try {
    const args = process.argv.slice(2)
    const relPath = args[0] || 'migrations/2026_03_10_add_auth_tables.sql'
    const sqlFile = path.isAbsolute(relPath) ? relPath : path.join(process.cwd(), relPath)

    if (!fs.existsSync(sqlFile)) {
      console.error('Migration file not found:', sqlFile)
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
    const password = env.DB_PASSWORD || process.env.DB_PASSWORD
    const database = env.DB_NAME || process.env.DB_NAME

    if (!user || !database) {
      console.error('DB_USER or DB_NAME not set in .env.local or environment')
      process.exit(2)
    }

    const sql = fs.readFileSync(sqlFile, 'utf8')
    console.log('Connecting to DB', { host, port, user, database })
    const conn = await mysql.createConnection({ host, port, user, password, database, multipleStatements: true })
    console.log('Applying migration:', sqlFile)
    await conn.query(sql)
    console.log('Migration applied successfully:', sqlFile)
    await conn.end()
    process.exit(0)
  } catch (err) {
    console.error('Migration failed:', err)
    process.exit(1)
  }
}

main()
