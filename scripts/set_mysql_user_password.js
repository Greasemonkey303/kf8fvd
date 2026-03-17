#!/usr/bin/env node
// Usage:
// node scripts/set_mysql_user_password.js --host=127.0.0.1 --port=3307 --rootUser=root --rootPass=rootpass --user=kf8fvd --newPass='Zachjcke052/'

const mysql = require('mysql2/promise')

function parseArgs() {
  const args = {}
  for (const a of process.argv.slice(2)) {
    const eq = a.indexOf('=')
    if (eq === -1) continue
    const k = a.slice(0, eq).replace(/^--/, '')
    const v = a.slice(eq + 1)
    args[k] = v
  }
  return args
}

async function main() {
  const args = parseArgs()
  const host = args.host || '127.0.0.1'
  const port = parseInt(args.port || '3306', 10)
  const rootUser = args.rootUser || 'root'
  const rootPass = args.rootPass || process.env.MYSQL_ROOT_PASSWORD
  const user = args.user
  const newPass = args.newPass

  if (!user || !newPass) {
    console.error('Missing required args. Example: --user=kf8fvd --newPass=MyP@ss')
    process.exit(2)
  }
  if (!rootPass) {
    console.error('Root password not provided. Set --rootPass or MYSQL_ROOT_PASSWORD env.')
    process.exit(2)
  }

  console.log('Connecting to target MySQL', { host, port, userToChange: user })
  const conn = await mysql.createConnection({ host, port, user: rootUser, password: rootPass })
  try {
    // Create user if not exists, then set password and grant privileges on db if provided
    const db = args.db || null
    // create user if necessary
    await conn.query(`CREATE USER IF NOT EXISTS \`${user.replace(/`/g,'``')}\`@'%' IDENTIFIED BY ?`, [newPass])
    // alter user to ensure password is set
    await conn.query(`ALTER USER \`${user.replace(/`/g,'``')}\`@'%' IDENTIFIED BY ?`, [newPass])
    if (db) {
      await conn.query(`GRANT ALL PRIVILEGES ON \`${db.replace(/`/g,'``')}\`.* TO \`${user.replace(/`/g,'``')}\`@'%'`)
    }
    await conn.query('FLUSH PRIVILEGES')
    console.log(`Password for user '${user}' set successfully.`)
  } finally {
    await conn.end()
  }
}

main().catch(err => {
  console.error('Error:', err && err.message ? err.message : String(err))
  process.exit(1)
})
