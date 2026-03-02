#!/usr/bin/env node
const { S3Client, PutBucketCorsCommand } = require('@aws-sdk/client-s3')
const fs = require('fs')
const path = require('path')

// usage: node scripts/set-minio-cors.js <bucket> [origin1,origin2,...]
async function main() {
  const bucket = process.argv[2]
  const originsArg = process.argv[3] || ''
  if (!bucket) {
    console.error('Usage: node scripts/set-minio-cors.js <bucket> [comma-separated-origins]')
    process.exit(2)
  }

  const origins = originsArg ? originsArg.split(',') : ['http://localhost:3000', 'http://127.0.0.1:3000']

  // auto-load .env.local if present
  try {
    const envPath = path.resolve(process.cwd(), '.env.local')
    if (fs.existsSync(envPath)) {
      const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/)
      for (const line of lines) {
        if (!line || line.trim().startsWith('#')) continue
        const idx = line.indexOf('=')
        if (idx === -1) continue
        const name = line.slice(0, idx).trim()
        const value = line.slice(idx + 1)
        if (!process.env[name]) process.env[name] = value
      }
    }
  } catch (e) {
    // ignore
  }

  const host = process.env.MINIO_HOST || '127.0.0.1'
  const port = process.env.MINIO_PORT || '9000'
  const useSSL = (process.env.MINIO_USE_SSL === 'true' || process.env.MINIO_USE_SSL === '1')
  const accessKey = process.env.MINIO_ACCESS_KEY || process.env.MINIO_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID
  const secretKey = process.env.MINIO_SECRET_KEY || process.env.MINIO_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY

  if (!accessKey || !secretKey) {
    console.error('MINIO_ACCESS_KEY and MINIO_SECRET_KEY (or AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY) must be set in env or .env.local')
    process.exit(2)
  }

  const endpoint = `${useSSL ? 'https' : 'http'}://${host}:${port}`

  const client = new S3Client({
    endpoint,
    region: process.env.AWS_REGION || 'us-east-1',
    credentials: { accessKeyId: accessKey, secretAccessKey: secretKey },
    forcePathStyle: true,
  })

  const cors = {
    CORSRules: [
      {
        AllowedOrigins: origins,
        AllowedMethods: ['GET', 'PUT', 'POST', 'HEAD'],
        AllowedHeaders: ['*'],
        ExposeHeaders: ['ETag'],
        MaxAgeSeconds: 3000,
      },
    ],
  }

  try {
    console.log('Applying CORS to bucket', bucket, 'on', endpoint)
    const cmd = new PutBucketCorsCommand({ Bucket: bucket, CORSConfiguration: cors })
    await client.send(cmd)
    console.log('CORS applied successfully')
  } catch (err) {
    console.error('Failed to apply CORS:', err)
    process.exit(1)
  }
}

main()
