#!/usr/bin/env node
const fs = require('fs')
const fsp = require('fs/promises')
const path = require('path')
const { spawn } = require('child_process')
const mysql = require('mysql2/promise')
const Minio = require('minio')
const { runWithMaintenanceRecord } = require('./lib/maintenance_run_logger')

function loadEnvFile() {
  const candidates = ['.env.local', 'env.local']
  for (const name of candidates) {
    const filePath = path.resolve(process.cwd(), name)
    if (!fs.existsSync(filePath)) continue
    const content = fs.readFileSync(filePath, 'utf8')
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const separator = trimmed.indexOf('=')
      if (separator === -1) continue
      const key = trimmed.slice(0, separator).trim()
      let value = trimmed.slice(separator + 1).trim()
      value = value.replace(/^['"]|['"]$/g, '')
      if (!process.env[key]) process.env[key] = value
    }
    return filePath
  }
  return null
}

function printUsage() {
  console.log([
    'Usage: node scripts/backup_restore_drill.js [options]',
    '',
    'Options:',
    '  --snapshot-only       Create the DB dump and MinIO mirror without restore verification.',
    '  --keep-restore-db     Keep the temporary restore database after verification.',
    '  --skip-db             Skip MySQL backup and restore verification.',
    '  --skip-minio          Skip MinIO mirror and restore verification.',
    '  --out-dir=<path>      Override the backup output directory.',
    '  --json                Print the final report as JSON.',
    '  --help                Show this message.',
  ].join('\n'))
}

function parseArgs(argv) {
  const args = argv.slice(2)
  const options = {
    snapshotOnly: false,
    keepRestoreDb: false,
    skipDb: false,
    skipMinio: false,
    outDir: null,
    json: false,
    help: false,
  }

  for (const arg of args) {
    if (arg === '--snapshot-only') options.snapshotOnly = true
    else if (arg === '--keep-restore-db') options.keepRestoreDb = true
    else if (arg === '--skip-db') options.skipDb = true
    else if (arg === '--skip-minio') options.skipMinio = true
    else if (arg === '--json') options.json = true
    else if (arg === '--help' || arg === '-h') options.help = true
    else if (arg.startsWith('--out-dir=')) options.outDir = arg.slice('--out-dir='.length)
    else throw new Error(`Unknown argument: ${arg}`)
  }

  return options
}

function getRequiredEnv(options) {
  const required = []
  if (!options.skipDb) {
    required.push('DB_HOST', 'DB_PORT', 'DB_USER', 'DB_NAME')
  }
  if (!options.skipMinio) {
    required.push('NEXT_PUBLIC_S3_BUCKET', 'MINIO_ACCESS_KEY', 'MINIO_SECRET_KEY')
  }
  return required
}

function getMissingEnv(options) {
  return getRequiredEnv(options).filter((key) => !process.env[key])
}

function createDbConnection(database) {
  return mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || '3306'),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined,
  })
}

function createMinioClient() {
  return new Minio.Client({
    endPoint: process.env.MINIO_HOST || process.env.MINIO_ENDPOINT || process.env.AWS_S3_ENDPOINT || '127.0.0.1',
    port: Number(process.env.MINIO_PORT || process.env.MINIO_HTTP_PORT || 9000),
    useSSL: process.env.MINIO_USE_SSL === 'true' || process.env.MINIO_USE_SSL === '1',
    accessKey: process.env.MINIO_ACCESS_KEY || process.env.AWS_ACCESS_KEY_ID,
    secretKey: process.env.MINIO_SECRET_KEY || process.env.AWS_SECRET_ACCESS_KEY,
  })
}

async function ensureDir(dirPath) {
  await fsp.mkdir(dirPath, { recursive: true })
}

function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd || process.cwd(),
      env: { ...process.env, ...(options.env || {}) },
      stdio: options.stdio || ['ignore', 'pipe', 'pipe'],
      shell: false,
    })

    let stdout = ''
    let stderr = ''

    if (child.stdout) child.stdout.on('data', (chunk) => { stdout += chunk.toString() })
    if (child.stderr) child.stderr.on('data', (chunk) => { stderr += chunk.toString() })

    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) resolve({ stdout, stderr })
      else reject(new Error(stderr.trim() || stdout.trim() || `${command} exited with code ${code}`))
    })
  })
}

async function commandExists(command) {
  const locator = process.platform === 'win32' ? 'where' : 'which'
  try {
    await runCommand(locator, [command])
    return true
  } catch {
    return false
  }
}

async function dockerContainerExists(containerName) {
  if (!(await commandExists('docker'))) return false
  try {
    const result = await runCommand('docker', ['ps', '--format', '{{.Names}}'])
    return result.stdout.split(/\r?\n/).map((line) => line.trim()).includes(containerName)
  } catch {
    return false
  }
}

function buildBackupPaths(options) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').replace('Z', '')
  const rootDir = options.outDir
    ? path.resolve(process.cwd(), options.outDir)
    : path.join(process.cwd(), 'data', 'backups', `drill_${timestamp}`)
  return {
    rootDir,
    dbDumpPath: path.join(rootDir, 'mysql', `${process.env.DB_NAME}.sql`),
    dbSnapshotPath: path.join(rootDir, 'mysql', `${process.env.DB_NAME}.json`),
    minioDir: path.join(rootDir, 'minio'),
    reportPath: path.join(rootDir, 'report.json'),
    timestamp,
  }
}

function normalizeRowValue(value) {
  if (value === undefined || value === null) return null
  if (Buffer.isBuffer(value)) return value.toString('base64')
  if (value instanceof Date) return value.toISOString().slice(0, 19).replace('T', ' ')
  if (Array.isArray(value)) return JSON.stringify(value)
  if (typeof value === 'object') return JSON.stringify(value)
  return value
}

function orderTablesByDependencies(tableNames, dependencyRows) {
  const remaining = new Set(tableNames)
  const incoming = new Map(tableNames.map((name) => [name, new Set()]))
  const outgoing = new Map(tableNames.map((name) => [name, new Set()]))

  for (const row of dependencyRows) {
    const table = row.TABLE_NAME
    const referenced = row.REFERENCED_TABLE_NAME
    if (!remaining.has(table) || !remaining.has(referenced)) continue
    incoming.get(table).add(referenced)
    outgoing.get(referenced).add(table)
  }

  const queue = tableNames.filter((name) => incoming.get(name).size === 0)
  const ordered = []

  while (queue.length) {
    const current = queue.shift()
    if (!remaining.has(current)) continue
    remaining.delete(current)
    ordered.push(current)
    for (const dependent of outgoing.get(current)) {
      const deps = incoming.get(dependent)
      deps.delete(current)
      if (deps.size === 0) queue.push(dependent)
    }
  }

  if (remaining.size) {
    ordered.push(...Array.from(remaining).sort())
  }

  return ordered
}

async function createNodeSnapshot(snapshotPath) {
  await ensureDir(path.dirname(snapshotPath))
  const database = process.env.DB_NAME
  const connection = await createDbConnection(database)
  try {
    const [tables] = await connection.query('SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = "BASE TABLE" ORDER BY TABLE_NAME ASC', [database])
    const [dependencies] = await connection.query('SELECT TABLE_NAME, REFERENCED_TABLE_NAME FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA = ? AND REFERENCED_TABLE_NAME IS NOT NULL', [database])
    const orderedTableNames = orderTablesByDependencies(tables.map((row) => row.TABLE_NAME), dependencies)
    const snapshot = {
      database,
      createdAt: new Date().toISOString(),
      tables: [],
    }

    for (const tableName of orderedTableNames) {
      const [createRows] = await connection.query(`SHOW CREATE TABLE \`${tableName.replace(/`/g, '``')}\``)
      const createSql = createRows[0]['Create Table']
      const [tableRows] = await connection.query(`SELECT * FROM \`${tableName.replace(/`/g, '``')}\``)
      snapshot.tables.push({
        name: tableName,
        createSql,
        rows: tableRows.map((entry) => Object.fromEntries(Object.entries(entry).map(([key, value]) => [key, normalizeRowValue(value)]))),
      })
    }

    await fsp.writeFile(snapshotPath, JSON.stringify(snapshot, null, 2), 'utf8')
    return { method: 'node-snapshot', path: snapshotPath }
  } finally {
    await connection.end()
  }
}

async function dumpMysql(dbDumpPath) {
  await ensureDir(path.dirname(dbDumpPath))

  const hostArgs = ['--host', process.env.DB_HOST || 'localhost', '--port', String(process.env.DB_PORT || '3306'), '--user', process.env.DB_USER, '--single-transaction', '--skip-lock-tables', process.env.DB_NAME]
  const hostEnv = process.env.DB_PASSWORD ? { MYSQL_PWD: process.env.DB_PASSWORD } : {}
  const hostAvailable = await commandExists('mysqldump')

  const writeDump = (command, args, env) => new Promise((resolve, reject) => {
    const output = fs.createWriteStream(dbDumpPath)
    const child = spawn(command, args, { env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'], shell: false })
    let stderr = ''
    child.stdout.pipe(output)
    child.stderr.on('data', (chunk) => { stderr += chunk.toString() })
    child.on('error', reject)
    child.on('close', (code) => {
      output.close()
      if (code === 0) resolve()
      else reject(new Error(stderr.trim() || `${command} exited with code ${code}`))
    })
  })

  if (hostAvailable) {
    await writeDump('mysqldump', hostArgs, hostEnv)
    return { method: 'host-cli', path: dbDumpPath }
  }

  const dockerContainer = 'kf8fvd-mysql'
  if (await dockerContainerExists(dockerContainer)) {
    await writeDump('docker', ['exec', '-e', `MYSQL_PWD=${process.env.DB_PASSWORD || ''}`, dockerContainer, 'mysqldump', '-u', process.env.DB_USER, '--single-transaction', '--skip-lock-tables', process.env.DB_NAME], {})
    return { method: 'docker-exec', path: dbDumpPath }
  }

  return createNodeSnapshot(dbDumpPath.replace(/\.sql$/i, '.json'))
}

async function importMysqlDump(dbDumpPath, targetDb) {
  const hostAvailable = await commandExists('mysql')
  const hostArgs = ['--host', process.env.DB_HOST || 'localhost', '--port', String(process.env.DB_PORT || '3306'), '--user', process.env.DB_USER, targetDb]
  const hostEnv = process.env.DB_PASSWORD ? { MYSQL_PWD: process.env.DB_PASSWORD } : {}

  const importDump = (command, args, env) => new Promise((resolve, reject) => {
    const input = fs.createReadStream(dbDumpPath)
    const child = spawn(command, args, { env: { ...process.env, ...env }, stdio: ['pipe', 'ignore', 'pipe'], shell: false })
    let stderr = ''
    input.pipe(child.stdin)
    child.stderr.on('data', (chunk) => { stderr += chunk.toString() })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(stderr.trim() || `${command} exited with code ${code}`))
    })
  })

  if (hostAvailable) {
    await importDump('mysql', hostArgs, hostEnv)
    return { method: 'host-cli' }
  }

  const dockerContainer = 'kf8fvd-mysql'
  if (await dockerContainerExists(dockerContainer)) {
    await importDump('docker', ['exec', '-i', '-e', `MYSQL_PWD=${process.env.DB_PASSWORD || ''}`, dockerContainer, 'mysql', '-u', process.env.DB_USER, targetDb], {})
    return { method: 'docker-exec' }
  }

  throw new Error('Unable to find mysql on PATH or a running kf8fvd-mysql container')
}

async function importNodeSnapshot(snapshotPath, targetDb) {
  const snapshot = JSON.parse(await fsp.readFile(snapshotPath, 'utf8'))
  const connection = await createDbConnection(targetDb)
  try {
    for (const table of snapshot.tables || []) {
      await connection.query(`DROP TABLE IF EXISTS \`${String(table.name).replace(/`/g, '``')}\``)
      await connection.query(String(table.createSql))

      const rows = Array.isArray(table.rows) ? table.rows : []
      if (!rows.length) continue

      const columns = Object.keys(rows[0])
      const placeholders = `(${columns.map(() => '?').join(',')})`
      const batchSize = 100

      for (let index = 0; index < rows.length; index += batchSize) {
        const batch = rows.slice(index, index + batchSize)
        const escapedTableName = String(table.name).replace(/`/g, '``')
        const escapedColumns = columns.map((column) => '`' + String(column).replace(/`/g, '``') + '`').join(',')
        const sql = `INSERT INTO \`${escapedTableName}\` (${escapedColumns}) VALUES ${batch.map(() => placeholders).join(',')}`
        const values = []
        for (const row of batch) {
          for (const column of columns) values.push(row[column])
        }
        await connection.query(sql, values)
      }
    }

    return { method: 'node-snapshot' }
  } finally {
    await connection.end()
  }
}

async function getTableCounts(database) {
  const connection = await createDbConnection(database)
  try {
    const [tables] = await connection.query('SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = "BASE TABLE" ORDER BY TABLE_NAME ASC', [database])
    const counts = []
    for (const row of tables) {
      const tableName = row.TABLE_NAME
      const [countRows] = await connection.query(`SELECT COUNT(*) AS total FROM \`${tableName.replace(/`/g, '``')}\``)
      counts.push({ table: tableName, count: Number(countRows[0].total || 0) })
    }
    return counts
  } finally {
    await connection.end()
  }
}

async function runMysqlRestoreDrill(dbDumpPath, options, timestamp) {
  const baseDb = process.env.DB_NAME
  const restoreDb = `${baseDb}_restore_drill_${timestamp.replace(/[^a-zA-Z0-9_]/g, '').slice(-24)}`
  const adminConnection = await createDbConnection(undefined)
  try {
    await adminConnection.query(`CREATE DATABASE \`${restoreDb.replace(/`/g, '``')}\``)
    const importResult = dbDumpPath.toLowerCase().endsWith('.json')
      ? await importNodeSnapshot(dbDumpPath, restoreDb)
      : await importMysqlDump(dbDumpPath, restoreDb)
    const sourceCounts = await getTableCounts(baseDb)
    const restoredCounts = await getTableCounts(restoreDb)
    const restoredMap = new Map(restoredCounts.map((entry) => [entry.table, entry.count]))
    const mismatches = sourceCounts.filter((entry) => restoredMap.get(entry.table) !== entry.count).map((entry) => ({
      table: entry.table,
      sourceCount: entry.count,
      restoredCount: restoredMap.get(entry.table) ?? null,
    }))

    if (!options.keepRestoreDb) {
      await adminConnection.query(`DROP DATABASE \`${restoreDb.replace(/`/g, '``')}\``)
    }

    return {
      restoreDb,
      keptRestoreDb: options.keepRestoreDb,
      importMethod: importResult.method,
      tablesChecked: sourceCounts.length,
      mismatches,
    }
  } finally {
    await adminConnection.end()
  }
}

async function streamToFile(stream, destination) {
  await ensureDir(path.dirname(destination))
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(destination)
    stream.pipe(output)
    stream.on('error', reject)
    output.on('error', reject)
    output.on('finish', resolve)
  })
}

async function mirrorMinioBucket(client, bucket, outDir) {
  await ensureDir(outDir)
  const objects = []
  const stream = client.listObjectsV2(bucket, '', true)
  for await (const obj of stream) {
    if (!obj || !obj.name) continue
    const key = String(obj.name)
    const destination = path.join(outDir, ...key.split('/'))
    const source = await client.getObject(bucket, key)
    await streamToFile(source, destination)
    const stats = await fsp.stat(destination)
    objects.push({ key, size: Number(obj.size || stats.size || 0), path: destination })
  }
  return objects
}

async function runMinioRestoreDrill(client, bucket, mirroredObjects, timestamp) {
  if (!mirroredObjects.length) {
    return { restoredSampleKey: null, verified: true, note: 'Bucket was empty during the drill.' }
  }

  const sample = mirroredObjects[0]
  const restoreKey = `restore-drills/${timestamp}/${path.basename(sample.key)}`
  await client.fPutObject(bucket, restoreKey, sample.path)
  const stat = await client.statObject(bucket, restoreKey)
  await client.removeObject(bucket, restoreKey)

  return {
    restoredSampleKey: restoreKey,
    verified: Number(stat.size || 0) === Number(sample.size || 0),
    expectedSize: sample.size,
    restoredSize: Number(stat.size || 0),
  }
}

function printHumanReport(report) {
  console.log(`Backup root: ${report.paths.rootDir}`)
  if (report.envFile) console.log(`Loaded env file: ${report.envFile}`)

  if (report.database) {
    console.log(`Database backup: ${report.database.backupPath} (${report.database.backupMethod})`)
    if (report.database.restore) {
      console.log(`Database restore drill: ${report.database.restore.tablesChecked} tables checked, mismatches=${report.database.restore.mismatches.length}`)
      if (report.database.restore.mismatches.length) {
        for (const mismatch of report.database.restore.mismatches) {
          console.log(`- DB mismatch ${mismatch.table}: source=${mismatch.sourceCount} restored=${mismatch.restoredCount}`)
        }
      }
    }
  }

  if (report.objectStorage) {
    console.log(`Object storage mirror: ${report.objectStorage.objectCount} objects -> ${report.objectStorage.mirrorDir}`)
    if (report.objectStorage.restore) {
      console.log(`Object restore drill: ${report.objectStorage.restore.verified ? 'verified' : 'failed'}${report.objectStorage.restore.restoredSampleKey ? ` via ${report.objectStorage.restore.restoredSampleKey}` : ''}`)
    }
  }

  console.log(`Report file: ${report.paths.reportPath}`)
}

async function main() {
  const envFile = loadEnvFile()
  const options = parseArgs(process.argv)
  if (options.help) {
    if (envFile) console.log(`Loaded env file: ${envFile}`)
    printUsage()
    return
  }

  const missingEnv = getMissingEnv(options)
  if (missingEnv.length) throw new Error(`Missing required environment variables: ${missingEnv.join(', ')}`)

  const paths = buildBackupPaths(options)
  await ensureDir(paths.rootDir)

  const report = {
    envFile,
    createdAt: new Date().toISOString(),
    recommendation: 'Schedule snapshot-only backups regularly and run the full restore drill during maintenance windows before high-risk deploys or schema changes.',
    paths,
    database: null,
    objectStorage: null,
  }

  if (!options.skipDb) {
    const dump = await dumpMysql(paths.dbDumpPath)
    report.database = {
      backupPath: dump.path,
      backupMethod: dump.method,
      restore: null,
    }

    if (!options.snapshotOnly) {
      report.database.restore = await runMysqlRestoreDrill(dump.path, options, paths.timestamp)
      if (report.database.restore.mismatches.length) {
        throw new Error(`MySQL restore drill found ${report.database.restore.mismatches.length} table count mismatches`)
      }
    }
  }

  if (!options.skipMinio) {
    const client = createMinioClient()
    const bucket = String(process.env.NEXT_PUBLIC_S3_BUCKET || '').trim()
    const mirroredObjects = await mirrorMinioBucket(client, bucket, paths.minioDir)
    report.objectStorage = {
      bucket,
      mirrorDir: paths.minioDir,
      objectCount: mirroredObjects.length,
      restore: null,
    }

    if (!options.snapshotOnly) {
      report.objectStorage.restore = await runMinioRestoreDrill(client, bucket, mirroredObjects, paths.timestamp)
      if (!report.objectStorage.restore.verified) {
        throw new Error('MinIO restore drill failed size verification')
      }
    }
  }

  await fsp.writeFile(paths.reportPath, JSON.stringify(report, null, 2), 'utf8')
  if (options.json) console.log(JSON.stringify(report, null, 2))
  else printHumanReport(report)

  return {
    status: options.snapshotOnly ? 'warning' : 'ok',
    summary: options.snapshotOnly
      ? `Backup snapshot completed at ${paths.rootDir}.`
      : `Backup restore drill completed with ${report.database?.restore?.mismatches?.length || 0} DB mismatches and object restore verified=${report.objectStorage?.restore?.verified !== false}.`,
    meta: {
      snapshotOnly: options.snapshotOnly,
      skipDb: options.skipDb,
      skipMinio: options.skipMinio,
      reportPath: paths.reportPath,
      objectCount: report.objectStorage?.objectCount || 0,
    },
  }
}

runWithMaintenanceRecord('backup_restore_drill', {
  commandText: 'node scripts/backup_restore_drill.js',
}, () => main()).catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})