#!/usr/bin/env node
const fs = require('fs')
const path = require('path')
const mysql = require('mysql2/promise')
const Minio = require('minio')
const { runWithMaintenanceRecord } = require('./lib/maintenance_run_logger')

const DEFAULT_PREFIXES = ['projects/', 'pages/', 'about/', 'credentials/', 'hero/', 'messages/']
const EXCLUDED_PREFIXES = ['healthchecks/', 'trash/']
const STATIC_SITE_MEDIA_KEYS = [
  'hero/static/grand_rapids.jpg',
  'about/static/headshot.jpg',
  'about/static/apts.jpg',
  'about/static/hamshack.jpg',
  'projects/hotspot/static/hotspot-1.jpg',
  'projects/hotspot/static/hotspot-2.jpg',
  'projects/hotspot/static/hotspot-3.jpg',
]

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
    'Usage: node scripts/storage_orphan_audit.js [options]',
    '',
    'Options:',
    '  --json                Print the full report as JSON.',
    '  --all-objects         Scan the whole bucket instead of only managed prefixes.',
    '  --prefix=<value>      Add an extra prefix to scan. Can be repeated.',
    '  --apply               Delete unreferenced objects after the audit completes.',
    '  --help                Show this message.',
    '',
    'Default behavior:',
    '  Scans DB-backed object references from projects, credentials, credential sections,',
    '  hero images, page metadata, and message attachments. It compares those keys against MinIO objects under',
    '  managed prefixes and reports both missing DB references and unreferenced bucket objects.',
  ].join('\n'))
}

function parseArgs(argv) {
  const args = argv.slice(2)
  const options = {
    json: false,
    allObjects: false,
    apply: false,
    help: false,
    extraPrefixes: [],
  }

  for (const arg of args) {
    if (arg === '--json') options.json = true
    else if (arg === '--all-objects') options.allObjects = true
    else if (arg === '--apply') options.apply = true
    else if (arg === '--help' || arg === '-h') options.help = true
    else if (arg.startsWith('--prefix=')) options.extraPrefixes.push(arg.slice('--prefix='.length))
    else throw new Error(`Unknown argument: ${arg}`)
  }

  return options
}

function getRequiredEnv() {
  return ['NEXT_PUBLIC_S3_BUCKET', 'DB_HOST', 'DB_PORT', 'DB_USER', 'DB_NAME', 'MINIO_ACCESS_KEY', 'MINIO_SECRET_KEY']
}

function getMissingEnv() {
  return getRequiredEnv().filter((key) => !process.env[key])
}

function createDbConnection() {
  return mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || '3306'),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
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

function normalizePrefix(prefix) {
  const value = String(prefix || '').trim().replace(/^\/+/, '')
  if (!value) return null
  return value.endsWith('/') ? value : `${value}/`
}

function resolveObjectKeyFromReference(value) {
  if (!value) return null

  try {
    const raw = String(value).trim()
    if (!raw) return null

    if (raw.startsWith('/api/uploads/get?')) {
      const url = new URL(raw, 'http://localhost')
      const key = url.searchParams.get('key')
      return key ? decodeURIComponent(key) : null
    }

    for (const prefix of ['/api/uploads/get/', '/uploads/get/']) {
      if (raw.startsWith(prefix)) {
        const encoded = raw.slice(prefix.length)
        return encoded ? decodeURIComponent(encoded) : null
      }
    }

    if (/^https?:\/\//i.test(raw)) {
      const url = new URL(raw)
      if (url.pathname.startsWith('/api/uploads/get/')) {
        const encoded = url.pathname.slice('/api/uploads/get/'.length)
        return encoded ? decodeURIComponent(encoded) : null
      }

      const keyFromQuery = url.searchParams.get('key')
      if (keyFromQuery) return decodeURIComponent(keyFromQuery)

      let objectPath = url.pathname.replace(/^\/+/, '')
      const bucket = String(process.env.NEXT_PUBLIC_S3_BUCKET || '').trim()
      if (bucket && objectPath.startsWith(`${bucket}/`)) objectPath = objectPath.slice(bucket.length + 1)
      return objectPath || null
    }

    if (raw.startsWith('/')) {
      const trimmed = raw.replace(/^\/+/, '')
      if (trimmed.startsWith('api/uploads/get/')) {
        const encoded = trimmed.slice('api/uploads/get/'.length)
        return encoded ? decodeURIComponent(encoded) : null
      }
      return trimmed || null
    }

    return raw
  } catch {
    return null
  }
}

function parseJson(value) {
  if (!value) return null
  if (typeof value === 'object') return value
  if (typeof value !== 'string') return null
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

function normalizeImageList(value) {
  if (!value) return []
  if (Array.isArray(value)) return value.filter(Boolean).map((entry) => String(entry))

  if (typeof value === 'object') {
    if (Array.isArray(value.images)) return value.images.filter(Boolean).map((entry) => String(entry))
    return []
  }

  if (typeof value !== 'string') return []

  try {
    const parsed = JSON.parse(value)
    return normalizeImageList(parsed)
  } catch {
    return value
      .split(/[\n,]+/)
      .map((entry) => entry.trim())
      .filter(Boolean)
  }
}

function collectMediaReferences(node, context, pushReference) {
  if (!node || typeof node !== 'object') return

  if (Array.isArray(node)) {
    for (const entry of node) collectMediaReferences(entry, context, pushReference)
    return
  }

  for (const [key, value] of Object.entries(node)) {
    if (key === 'image' || key === 'image_path') {
      pushReference(context, key, value)
      continue
    }

    if (key === 'images') {
      for (const entry of normalizeImageList(value)) pushReference(context, 'images', entry)
      continue
    }

    if (value && typeof value === 'object') collectMediaReferences(value, context, pushReference)
  }
}

function addReference(target, scope, field, row, value) {
  const key = resolveObjectKeyFromReference(value)
  if (!key) return
  target.references.push({
    scope,
    field,
    rowId: row.id ?? null,
    rowSlug: row.slug ?? null,
    reference: String(value),
    key,
  })
  target.keys.add(key)
}

async function collectDbReferences(connection) {
  const state = {
    references: [],
    keys: new Set(),
  }

  for (const key of STATIC_SITE_MEDIA_KEYS) {
    state.references.push({
      scope: 'site_media',
      field: 'static_manifest',
      rowId: null,
      rowSlug: null,
      reference: key,
      key,
    })
    state.keys.add(key)
  }

  const projects = await connection.query('SELECT id, slug, image_path, metadata FROM projects')
  for (const row of projects[0]) {
    addReference(state, 'projects', 'image_path', row, row.image_path)
    const metadata = parseJson(row.metadata)
    if (metadata) {
      for (const entry of normalizeImageList(metadata)) addReference(state, 'projects', 'metadata.images', row, entry)
      if (metadata && typeof metadata === 'object' && metadata.images) {
        for (const entry of normalizeImageList(metadata.images)) addReference(state, 'projects', 'metadata.images', row, entry)
      }
    }
  }

  const credentialSections = await connection.query('SELECT id, slug, image_path, metadata FROM credential_sections')
  for (const row of credentialSections[0]) {
    addReference(state, 'credential_sections', 'image_path', row, row.image_path)
    collectMediaReferences(parseJson(row.metadata), row, (context, field, value) => addReference(state, 'credential_sections', `metadata.${field}`, context, value))
  }

  const credentials = await connection.query('SELECT id, slug, section, s3_prefix, image_path, metadata FROM credentials')
  for (const row of credentials[0]) {
    addReference(state, 'credentials', 'image_path', row, row.image_path)
    collectMediaReferences(parseJson(row.metadata), row, (context, field, value) => addReference(state, 'credentials', `metadata.${field}`, context, value))
  }

  const heroImages = await connection.query('SELECT id, hero_id, url, variants FROM hero_image')
  for (const row of heroImages[0]) {
    addReference(state, 'hero_image', 'url', row, row.url)
    const variants = parseJson(row.variants)
    if (variants && typeof variants === 'object') {
      for (const [name, value] of Object.entries(variants)) addReference(state, 'hero_image', `variants.${name}`, row, value)
    }
  }

  const pages = await connection.query('SELECT id, slug, metadata FROM pages')
  for (const row of pages[0]) {
    const metadata = parseJson(row.metadata)
    if (!metadata) continue
    collectMediaReferences(metadata, row, (context, field, value) => addReference(state, 'pages', `metadata.${field}`, context, value))
  }

  const messages = await connection.query('SELECT id, attachments FROM messages WHERE attachments IS NOT NULL AND attachments <> ""')
  for (const row of messages[0]) {
    const attachments = parseJson(row.attachments)
    if (!Array.isArray(attachments)) continue
    for (const attachment of attachments) {
      if (!attachment || typeof attachment !== 'object') continue
      if (attachment.key) addReference(state, 'messages', 'attachments.key', row, attachment.key)
    }
  }

  return state
}

async function listBucketObjects(client, bucket, prefixes, allObjects) {
  const seen = new Set()
  const keys = []

  const scanPrefix = async (prefix) => {
    const stream = client.listObjectsV2(bucket, prefix, true)
    for await (const obj of stream) {
      if (!obj || !obj.name) continue
      const key = String(obj.name)
      if (EXCLUDED_PREFIXES.some((excluded) => key.startsWith(excluded))) continue
      if (!seen.has(key)) {
        seen.add(key)
        keys.push(key)
      }
    }
  }

  if (allObjects) {
    await scanPrefix('')
    return keys.sort()
  }

  for (const prefix of prefixes) await scanPrefix(prefix)
  return keys.sort()
}

function printHumanReport(report) {
  console.log(`Bucket: ${report.bucket}`)
  console.log(`Mode: ${report.mode}`)
  console.log(`Prefixes scanned: ${report.prefixesScanned.length ? report.prefixesScanned.join(', ') : '(entire bucket)'}`)
  console.log(`DB references: ${report.summary.dbReferenceCount} (${report.summary.uniqueReferencedKeyCount} unique keys)`)
  console.log(`Bucket objects scanned: ${report.summary.bucketObjectCount}`)
  console.log(`Missing DB references: ${report.summary.missingReferenceCount}`)
  console.log(`Unreferenced bucket objects: ${report.summary.unreferencedObjectCount}`)

  if (report.summary.deletedObjectCount > 0) {
    console.log(`Deleted unreferenced objects: ${report.summary.deletedObjectCount}`)
  }

  if (report.missingReferences.length) {
    console.log('\nMissing DB references:')
    for (const entry of report.missingReferences) {
      console.log(`- [${entry.scope}] row=${entry.rowId ?? 'n/a'} slug=${entry.rowSlug ?? 'n/a'} field=${entry.field} key=${entry.key}`)
    }
  }

  if (report.unreferencedObjects.length) {
    console.log('\nUnreferenced bucket objects:')
    for (const key of report.unreferencedObjects) console.log(`- ${key}`)
  }

  if (!report.missingReferences.length && !report.unreferencedObjects.length) {
    console.log('\nNo orphaned storage issues found in the scanned scope.')
  }

  if (!report.appliedDeletion) {
    console.log('\nCleanup mode: manual by default. Re-run with --apply to delete only the unreferenced bucket objects listed above.')
  } else {
    console.log('\nCleanup mode: unreferenced objects were deleted because --apply was provided.')
  }
}

async function main() {
  const envFile = loadEnvFile()
  const options = parseArgs(process.argv)

  if (options.help) {
    if (envFile) console.log(`Loaded env file: ${envFile}`)
    printUsage()
    return
  }

  const missingEnv = getMissingEnv()
  if (missingEnv.length) {
    throw new Error(`Missing required environment variables: ${missingEnv.join(', ')}`)
  }

  const bucket = String(process.env.NEXT_PUBLIC_S3_BUCKET || '').trim()
  const envPrefix = normalizePrefix(process.env.S3_UPLOAD_PREFIX || 'projects/')
  const prefixes = Array.from(new Set([...DEFAULT_PREFIXES, envPrefix, ...options.extraPrefixes.map(normalizePrefix)].filter(Boolean))).sort()

  let connection
  try {
    connection = await createDbConnection()
    const client = createMinioClient()
    const dbReferences = await collectDbReferences(connection)
    const bucketObjects = await listBucketObjects(client, bucket, prefixes, options.allObjects)
    const bucketObjectSet = new Set(bucketObjects)

    const missingReferences = dbReferences.references.filter((entry) => !bucketObjectSet.has(entry.key))
    const unreferencedObjects = bucketObjects.filter((key) => !dbReferences.keys.has(key))

    const deletedObjects = []
    if (options.apply && unreferencedObjects.length) {
      for (const key of unreferencedObjects) {
        await client.removeObject(bucket, key)
        deletedObjects.push(key)
      }
    }

    const report = {
      bucket,
      envFile,
      mode: options.allObjects ? 'all-objects' : 'managed-prefixes',
      prefixesScanned: options.allObjects ? [] : prefixes,
      appliedDeletion: options.apply,
      recommendation: 'Run this audit manually before large cleanup operations and optionally schedule it in dry-run mode for recurring reporting.',
      summary: {
        dbReferenceCount: dbReferences.references.length,
        uniqueReferencedKeyCount: dbReferences.keys.size,
        bucketObjectCount: bucketObjects.length,
        missingReferenceCount: missingReferences.length,
        unreferencedObjectCount: unreferencedObjects.length,
        deletedObjectCount: deletedObjects.length,
      },
      missingReferences,
      unreferencedObjects,
      deletedObjects,
    }

    if (options.json) console.log(JSON.stringify(report, null, 2))
    else printHumanReport(report)

    return {
      status: report.summary.missingReferenceCount || report.summary.unreferencedObjectCount ? 'warning' : 'ok',
      summary: `Storage audit scanned ${report.summary.bucketObjectCount} objects with ${report.summary.missingReferenceCount} missing refs and ${report.summary.unreferencedObjectCount} unreferenced objects.`,
      meta: report.summary,
    }
  } finally {
    if (connection) await connection.end()
  }
}

runWithMaintenanceRecord('storage_orphan_audit', {
  commandText: 'node scripts/storage_orphan_audit.js',
}, () => main()).catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})