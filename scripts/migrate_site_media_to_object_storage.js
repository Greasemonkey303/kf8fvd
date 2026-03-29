#!/usr/bin/env node
const fs = require('fs')
const path = require('path')
const mysql = require('mysql2/promise')
const Minio = require('minio')

const SITE_MEDIA = [
  { name: 'homeHero', source: 'data/static-media-source/grand_rapids.jpg', key: 'hero/static/grand_rapids.jpg', legacyPath: '/grand_rapids.jpg', contentType: 'image/jpeg' },
  { name: 'aboutHeadshot', source: 'data/static-media-source/headshot.jpg', key: 'about/static/headshot.jpg', legacyPath: '/headshot.jpg', contentType: 'image/jpeg' },
  { name: 'aboutTopology', source: 'data/static-media-source/apts.jpg', key: 'about/static/apts.jpg', legacyPath: '/apts.jpg', contentType: 'image/jpeg' },
  { name: 'aboutHamshack', source: 'data/static-media-source/hamshack.jpg', key: 'about/static/hamshack.jpg', legacyPath: '/hamshack.jpg', contentType: 'image/jpeg' },
  { name: 'hotspot1', source: 'data/static-media-source/hotspot/hotspot-1.jpg', key: 'projects/hotspot/static/hotspot-1.jpg', legacyPath: '/hotspot/hotspot-1.jpg', contentType: 'image/jpeg' },
  { name: 'hotspot2', source: 'data/static-media-source/hotspot/hotspot-2.jpg', key: 'projects/hotspot/static/hotspot-2.jpg', legacyPath: '/hotspot/hotspot-2.jpg', contentType: 'image/jpeg' },
  { name: 'hotspot3', source: 'data/static-media-source/hotspot/hotspot-3.jpg', key: 'projects/hotspot/static/hotspot-3.jpg', legacyPath: '/hotspot/hotspot-3.jpg', contentType: 'image/jpeg' },
]

const LEGACY_TO_KEY = Object.fromEntries(SITE_MEDIA.map((entry) => [entry.legacyPath, entry.key]))

function loadEnv(file = '.env.local') {
  try {
    const filePath = path.resolve(process.cwd(), file)
    const content = fs.readFileSync(filePath, 'utf8')
    content.split(/\r?\n/).forEach((line) => {
      const match = line.match(/^\s*([^#=]+?)\s*=\s*(.*)\s*$/)
      if (!match) return
      const key = match[1].trim()
      let value = match[2].trim()
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1)
      if (!process.env[key]) process.env[key] = value
    })
  } catch {}
}

function parseArgs(argv) {
  return {
    json: argv.includes('--json'),
    apply: argv.includes('--apply'),
    force: argv.includes('--force'),
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

async function objectExists(client, bucket, key) {
  try {
    await client.statObject(bucket, key)
    return true
  } catch {
    return false
  }
}

function replaceLegacyValues(node) {
  if (Array.isArray(node)) {
    let changed = false
    const mapped = node.map((entry) => {
      const result = replaceLegacyValues(entry)
      changed = changed || result.changed
      return result.value
    })
    return { value: mapped, changed }
  }

  if (node && typeof node === 'object') {
    let changed = false
    const mapped = {}
    for (const [key, value] of Object.entries(node)) {
      const result = replaceLegacyValues(value)
      mapped[key] = result.value
      changed = changed || result.changed
    }
    return { value: mapped, changed }
  }

  if (typeof node === 'string' && LEGACY_TO_KEY[node]) {
    return { value: LEGACY_TO_KEY[node], changed: true }
  }

  return { value: node, changed: false }
}

async function migrate() {
  loadEnv('.env.local')
  const options = parseArgs(process.argv.slice(2))
  const bucket = process.env.NEXT_PUBLIC_S3_BUCKET
  if (!bucket) throw new Error('NEXT_PUBLIC_S3_BUCKET is required')

  const client = createMinioClient()
  const connection = await createDbConnection()
  const report = { uploaded: [], plannedUploads: [], skipped: [], updatedPages: 0, updatedProjects: 0 }

  try {
    for (const asset of SITE_MEDIA) {
      const sourcePath = path.resolve(process.cwd(), asset.source)
      if (!fs.existsSync(sourcePath)) throw new Error(`Missing source asset: ${sourcePath}`)
      const exists = await objectExists(client, bucket, asset.key)
      if (!exists || options.force) {
        if (options.apply) {
          const buffer = fs.readFileSync(sourcePath)
          await client.putObject(bucket, asset.key, buffer, buffer.length, { 'Content-Type': asset.contentType })
          report.uploaded.push(asset.key)
        } else {
          report.plannedUploads.push(asset.key)
        }
      } else {
        report.skipped.push(asset.key)
      }
    }

    const [pages] = await connection.query('SELECT id, metadata FROM pages')
    for (const row of pages) {
      if (!row.metadata) continue
      let parsed
      try { parsed = typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata } catch { continue }
      const result = replaceLegacyValues(parsed)
      if (!result.changed) continue
      if (options.apply) {
        await connection.execute('UPDATE pages SET metadata = ? WHERE id = ?', [JSON.stringify(result.value), row.id])
      }
      report.updatedPages += 1
    }

    const [projects] = await connection.query('SELECT id, image_path, metadata FROM projects')
    for (const row of projects) {
      let changed = false
      let imagePath = row.image_path
      if (typeof imagePath === 'string' && LEGACY_TO_KEY[imagePath]) {
        imagePath = LEGACY_TO_KEY[imagePath]
        changed = true
      }

      let metadata = row.metadata
      if (metadata) {
        try {
          const parsed = typeof metadata === 'string' ? JSON.parse(metadata) : metadata
          const result = replaceLegacyValues(parsed)
          metadata = result.value
          changed = changed || result.changed
        } catch {}
      }

      if (!changed) continue
      if (options.apply) {
        await connection.execute('UPDATE projects SET image_path = ?, metadata = ? WHERE id = ?', [imagePath || null, metadata ? JSON.stringify(metadata) : null, row.id])
      }
      report.updatedProjects += 1
    }
  } finally {
    await connection.end()
  }

  if (options.json) console.log(JSON.stringify(report, null, 2))
  else console.log(report)
}

migrate().catch((error) => {
  console.error('site media migration failed', error)
  process.exit(1)
})