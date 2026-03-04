const fs = require('fs')
const path = require('path')
const mysql = require('mysql2/promise')

function parseDotEnv(filePath) {
  const env = {}
  if (!fs.existsSync(filePath)) return env
  const content = fs.readFileSync(filePath, 'utf8')
  content.split(/\r?\n/).forEach((line) => {
    line = line.trim()
    if (!line || line.startsWith('#')) return
    const eq = line.indexOf('=')
    if (eq === -1) return
    const key = line.slice(0, eq).trim()
    let val = line.slice(eq + 1).trim()
    if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1)
    if (val.startsWith("'") && val.endsWith("'")) val = val.slice(1, -1)
    env[key] = val
  })
  return env
}

;(async () => {
  try {
    const repoRoot = path.resolve(__dirname, '..')
    const envFile = path.join(repoRoot, '.env.local')
    const env = { ...process.env, ...parseDotEnv(envFile) }

    const host = env.DB_HOST || env.NEXT_PUBLIC_DB_HOST || env.MYSQL_HOST || 'localhost'
    const port = parseInt(env.DB_PORT || env.MYSQL_PORT || '3306', 10)
    const user = env.DB_USER || env.MYSQL_USER || env.USER || 'root'
    const password = env.DB_PASSWORD || env.MYSQL_PASSWORD || ''
    const database = env.DB_NAME || env.MYSQL_DATABASE || env.DB_DATABASE

    if (!database) {
      console.error('No database configured. Set DB_NAME / DB_DATABASE in .env.local or environment.')
      process.exit(2)
    }

    console.log(`Connecting to MySQL ${user}@${host}:${port}/${database}`)
    const conn = await mysql.createConnection({ host, port, user, password, database })

    const sqlPath = path.join(repoRoot, 'db', 'pages_seed.sql')
    if (!fs.existsSync(sqlPath)) {
      console.error('Seed file not found at', sqlPath)
      process.exit(3)
    }
    const sql = fs.readFileSync(sqlPath, 'utf8')

    console.log('Running seed...')
    const [res] = await conn.query(sql)
    console.log('Seed executed. Result:', res && res.affectedRows ? `${res.affectedRows} rows affected` : res)

    // Confirm the about row
    const [rows] = await conn.query("SELECT id, slug, metadata FROM pages WHERE slug = 'about' LIMIT 1")
    console.log('About row:', rows && rows[0] ? rows[0] : 'not found')

    await conn.end()
    process.exit(0)
  } catch (err) {
    console.error('Seed failed:', err && err.message ? err.message : err)
    process.exit(1)
  }
})()
