#!/usr/bin/env node
/*
  E2E helper to verify S3/MinIO connectivity for credentials uploads.
  Usage: set env vars (NEXT_PUBLIC_S3_BUCKET, MINIO_HOST/ENDPOINT, MINIO_PORT, MINIO_ACCESS_KEY, MINIO_SECRET_KEY) then run:
    node scripts/verify_credentials_s3.js
*/
const Minio = require('minio')
const crypto = require('crypto')

async function main() {
  const bucket = process.env.NEXT_PUBLIC_S3_BUCKET
  if (!bucket) {
    console.error('Missing NEXT_PUBLIC_S3_BUCKET environment variable')
    process.exit(1)
  }

  const client = new Minio.Client({
    endPoint: process.env.MINIO_HOST || process.env.MINIO_ENDPOINT || process.env.AWS_S3_ENDPOINT || '127.0.0.1',
    port: parseInt(process.env.MINIO_PORT || process.env.MINIO_HTTP_PORT || '9000', 10),
    useSSL: (process.env.MINIO_USE_SSL === 'true' || process.env.MINIO_USE_SSL === '1'),
    accessKey: process.env.MINIO_ACCESS_KEY || process.env.AWS_ACCESS_KEY_ID,
    secretKey: process.env.MINIO_SECRET_KEY || process.env.AWS_SECRET_ACCESS_KEY,
  })

  const prefix = `credentials-e2e/${Date.now()}-${crypto.randomBytes(4).toString('hex')}`
  const key = `${prefix}/e2e-test.txt`
  const body = `e2e credentials test ${new Date().toISOString()}`

  try {
    console.log('Uploading test object to', bucket, key)
    await client.putObject(bucket, key, Buffer.from(body))
    console.log('Upload OK')
  } catch (err) {
    console.error('Upload failed:', err)
    process.exit(2)
  }

  try {
    const found = []
    const stream = client.listObjectsV2(bucket, `${prefix}/`, true)
    for await (const obj of stream) {
      if (obj && obj.name) found.push(obj.name)
    }
    console.log('List objects under prefix:', found)
  } catch (err) {
    console.error('List failed:', err)
  }

  try {
    console.log('Removing test object')
    await client.removeObjects(bucket, [key])
    console.log('Remove OK')
  } catch (err) {
    console.error('Remove failed:', err)
    process.exit(3)
  }

  console.log('E2E S3 verification complete')
}

main().catch(err => { console.error(err); process.exit(9) })
