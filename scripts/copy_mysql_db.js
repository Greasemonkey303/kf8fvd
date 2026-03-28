#!/usr/bin/env node
// Usage example (run locally):
// node scripts/copy_mysql_db.js --srcHost=127.0.0.1 --srcPort=3306 --srcUser=15Zfreed --srcPass='Zachjcke052/' --srcDb=kf8fvd --tgtHost=127.0.0.1 --tgtPort=3307 --tgtUser=root --tgtPass=rootpass --tgtDb=kf8fvd

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

function escIdent(s) { return s.replace(/`/g, '``') }

async function copyTable(source, target, srcDb, table) {
  console.log(`Copying table ${table}...`)
  // get create SQL
  const [cr] = await source.query(`SHOW CREATE TABLE \`${escIdent(srcDb)}\`.\`${escIdent(table)}\``)
  const createSql = cr && cr[0] && (cr[0]['Create Table'] || cr[0]['Create View'])
  if (!createSql) throw new Error('Failed to get CREATE for ' + table)

  // create table on target
  await target.query(`DROP TABLE IF EXISTS \`${escIdent(table)}\``)
  await target.query(createSql)

  // copy data in batches
  const [rows] = await source.query(`SELECT * FROM \`${escIdent(srcDb)}\`.\`${escIdent(table)}\``)
  if (!rows || rows.length === 0) return

  // detect JSON columns so we can coerce/clean values before inserting
  let jsonCols = new Set()
  try {
    const [colInfo] = await source.query('SELECT COLUMN_NAME, DATA_TYPE, COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?', [srcDb, table])
    if (Array.isArray(colInfo)) {
      for (const r of colInfo) {
        const name = (r.COLUMN_NAME || r.Column_name || r.COLUMN_NAME || r.column_name)
        const dtype = String(r.DATA_TYPE || r.data_type || '').toLowerCase()
        const ctype = String(r.COLUMN_TYPE || r.column_type || '').toLowerCase()
        if (dtype === 'json' || ctype.includes('json')) jsonCols.add(name)
      }
    }
  } catch {
    // best-effort: continue without json column detection
  }

  const cols = Object.keys(rows[0])
  const placeholders = cols.map(() => '?').join(',')
  const batchSize = 500

  function normalizeJsonValue(val) {
    if (val === null || val === undefined) return null
    if (Buffer.isBuffer(val)) val = val.toString('utf8')
    if (typeof val === 'number' || typeof val === 'boolean') return val
    if (typeof val === 'object') {
      try { return JSON.stringify(val) } catch { return String(val) }
    }
    if (typeof val === 'string') {
      try { JSON.parse(val); return val } catch { return JSON.stringify(val) }
    }
    return String(val)
  }

  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize)
    const values = []
    for (const r of batch) {
      for (const c of cols) {
        let v = r[c]
        if (jsonCols.has(c)) {
          v = normalizeJsonValue(v)
        }
        values.push(v)
      }
    }
    const multi = batch.map(() => `(${placeholders})`).join(',')
    await target.query(`INSERT INTO \`${escIdent(table)}\` (${cols.map(c=>`\`${escIdent(c)}\``).join(',')}) VALUES ${multi}`, values)
  }
}

async function main() {
  const args = parseArgs()
  const sCfg = { host: args.srcHost || '127.0.0.1', port: parseInt(args.srcPort||'3306',10), user: args.srcUser, password: args.srcPass }
  const tCfg = { host: args.tgtHost || '127.0.0.1', port: parseInt(args.tgtPort||'3306',10), user: args.tgtUser, password: args.tgtPass }
  const srcDb = args.srcDb
  const tgtDb = args.tgtDb || srcDb

  if (!sCfg.user || !sCfg.password || !srcDb) {
    console.error('Missing source args. Example: --srcUser=... --srcPass=... --srcDb=...')
    process.exit(2)
  }
  if (!tCfg.user || !tCfg.password) {
    console.error('Missing target args. Example: --tgtUser=... --tgtPass=...')
    process.exit(2)
  }

  console.log('Connecting to source', sCfg.host + ':' + sCfg.port, 'and target', tCfg.host + ':' + tCfg.port)
  const src = await mysql.createConnection({ ...sCfg, multipleStatements: true })
  const tgt = await mysql.createConnection({ ...tCfg, multipleStatements: true })

  try {
    // ensure target database exists
    await tgt.query(`CREATE DATABASE IF NOT EXISTS \`${escIdent(tgtDb)}\``)
    await tgt.query(`USE \`${escIdent(tgtDb)}\``)

    // disable foreign key checks while importing
    await tgt.query('SET FOREIGN_KEY_CHECKS=0')

    // list tables in source
    const [tables] = await src.query('SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = "BASE TABLE"', [srcDb])
    for (const row of tables) {
      const table = row['TABLE_NAME']
      await copyTable(src, tgt, srcDb, table)
    }

    await tgt.query('SET FOREIGN_KEY_CHECKS=1')
    console.log('Copy complete.')
  } finally {
    await src.end()
    await tgt.end()
  }
}

main().catch(err => {
  console.error('Error:', err && err.message ? err.message : String(err))
  process.exit(1)
})
