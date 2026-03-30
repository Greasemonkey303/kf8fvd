const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const mysql = require('mysql2/promise')
const Redis = require('ioredis')
const Minio = require('minio')

function buildRedisUrlFromParts() {
  const host = (process.env.REDIS_HOST || '').trim()
  const port = (process.env.REDIS_PORT || '6379').trim()
  const password = process.env.REDIS_PASSWORD || ''
  const username = process.env.REDIS_USERNAME || ''

  if (!host) return ''

  const auth = password || username
    ? `${encodeURIComponent(username)}:${encodeURIComponent(password)}@`
    : ''

  return `redis://${auth}${host}:${port}`
}

function normalizeRedisUrl(raw) {
  const trimmed = String(raw || '').trim()
  if (!trimmed) return ''

  const authMatch = trimmed.match(/^(redis(?:s)?):\/\/:([^@]*)@(.+)$/i)
  if (authMatch) {
    const [, scheme, password, rest] = authMatch
    return `${scheme}://:${encodeURIComponent(password)}@${rest}`
  }

  return trimmed
}

function getRedisUrl() {
  return buildRedisUrlFromParts() || normalizeRedisUrl(process.env.REDIS_URL || '')
}

function loadEnvFile() {
  const candidates = ['.env.local', 'env.local']
  for (const name of candidates) {
    const filePath = path.resolve(process.cwd(), name)
    if (!fs.existsSync(filePath)) continue
    const content = fs.readFileSync(filePath, 'utf8')
    content.split(/\r?\n/).forEach((line) => {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) return
      const index = trimmed.indexOf('=')
      if (index === -1) return
      const key = trimmed.slice(0, index).trim()
      let value = trimmed.slice(index + 1).trim()
      value = value.replace(/^['"]|['"]$/g, '')
      if (!process.env[key]) process.env[key] = value
    })
    return filePath
  }
  return null
}

function printStep(status, label, details) {
  const suffix = details ? ` ${details}` : ''
  console.log(`${status} ${label}${suffix}`)
}

function collectRequiredEnv() {
  return [
    'NEXTAUTH_SECRET',
    'NEXT_PUBLIC_S3_BUCKET',
    'DB_HOST',
    'DB_PORT',
    'DB_USER',
    'DB_NAME',
    'MINIO_ACCESS_KEY',
    'MINIO_SECRET_KEY',
  ]
}

function getMissingEnv() {
  const missing = collectRequiredEnv().filter((key) => !process.env[key])
  if (!getRedisUrl()) missing.push('REDIS_URL or REDIS_HOST/REDIS_PORT')
  return missing
}

async function checkDatabase() {
  const startedAt = Date.now()
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || '3306'),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined,
  })
  try {
    await connection.query('SELECT 1 AS ok')
    return { ok: true, latencyMs: Date.now() - startedAt }
  } finally {
    await connection.end()
  }
}

async function checkRedis() {
  const startedAt = Date.now()
  const client = new Redis(getRedisUrl(), {
    maxRetriesPerRequest: 1,
    connectTimeout: 1500,
    lazyConnect: true,
    enableOfflineQueue: false,
  })

  try {
    await client.connect()
    const pong = await client.ping()
    if (pong !== 'PONG') throw new Error(`Unexpected Redis ping response: ${pong}`)
    return { ok: true, latencyMs: Date.now() - startedAt }
  } finally {
    try { client.disconnect(false) } catch (error) { void error }
  }
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

async function checkObjectStorage(options) {
  const startedAt = Date.now()
  const bucket = process.env.NEXT_PUBLIC_S3_BUCKET
  const client = createMinioClient()
  const exists = await client.bucketExists(bucket)
  if (!exists) throw new Error(`Bucket not found: ${bucket}`)

  const result = { ok: true, latencyMs: Date.now() - startedAt, writeVerified: false }

  if (!options.storageWriteTest) return result

  const objectKey = `healthchecks/${Date.now()}-${crypto.randomBytes(4).toString('hex')}.txt`
  const body = Buffer.from(`kf8fvd readiness probe ${new Date().toISOString()}\n`, 'utf8')
  await client.putObject(bucket, objectKey, body, body.length)
  const stat = await client.statObject(bucket, objectKey)
  if (!stat || Number(stat.size || 0) !== body.length) {
    throw new Error(`Unexpected object stat for readiness probe: ${objectKey}`)
  }
  await client.removeObject(bucket, objectKey)
  result.latencyMs = Date.now() - startedAt
  result.writeVerified = true
  return result
}

function parseArgs(argv) {
  const args = new Set(argv.slice(2))
  return {
    storageWriteTest: args.has('--storage-write-test'),
  }
}

async function main() {
  const envFile = loadEnvFile()
  if (envFile) printStep('INFO', 'Loaded env file', envFile)

  const options = parseArgs(process.argv)
  const missing = getMissingEnv()
  if (missing.length) {
    printStep('FAIL', 'Missing required environment variables', missing.join(', '))
    process.exit(2)
  }

  const summary = { env: true, database: null, redis: null, objectStorage: null }

  try {
    const database = await checkDatabase()
    summary.database = database
    printStep('PASS', 'MySQL connectivity', `${database.latencyMs}ms`)
  } catch (error) {
    printStep('FAIL', 'MySQL connectivity', error instanceof Error ? error.message : String(error))
    process.exit(1)
  }

  try {
    const redis = await checkRedis()
    summary.redis = redis
    printStep('PASS', 'Redis connectivity', `${redis.latencyMs}ms`)
  } catch (error) {
    printStep('FAIL', 'Redis connectivity', error instanceof Error ? error.message : String(error))
    process.exit(1)
  }

  try {
    const objectStorage = await checkObjectStorage(options)
    summary.objectStorage = objectStorage
    const detail = objectStorage.writeVerified ? `${objectStorage.latencyMs}ms (write/delete verified)` : `${objectStorage.latencyMs}ms (bucket probe only)`
    printStep('PASS', 'Object storage connectivity', detail)
  } catch (error) {
    printStep('FAIL', 'Object storage connectivity', error instanceof Error ? error.message : String(error))
    process.exit(1)
  }

  printStep('PASS', 'Backend readiness complete', JSON.stringify(summary))
}

main().catch((error) => {
  printStep('FAIL', 'Backend readiness crashed', error instanceof Error ? error.stack || error.message : String(error))
  process.exit(1)
})