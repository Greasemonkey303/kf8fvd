#!/usr/bin/env node
const fs = require('fs')
const path = require('path')
const os = require('os')
const { execSync } = require('child_process')
let S3Client, PutBucketCorsCommand
try {
  ;({ S3Client, PutBucketCorsCommand } = require('@aws-sdk/client-s3'))
} catch (e) {
  // AWS SDK not installed — we'll fall back to CLI or mc
}

// usage: node scripts/set-minio-cors.js <bucket> [comma-separated-origins]
// This script prefers the AWS CLI (S3 API) to apply a CORS configuration, and
// falls back to suggesting `mc` (MinIO client) commands if available.

function loadDotEnvIfPresent() {
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
}

function usageExit() {
  console.error('Usage: node scripts/set-minio-cors.js <bucket> [comma-separated-origins]')
  process.exit(2)
}

loadDotEnvIfPresent()

const bucket = process.argv[2]
const originsArg = process.argv[3] || ''
if (!bucket) usageExit()
const origins = originsArg ? originsArg.split(',') : ['http://localhost:3000', 'http://127.0.0.1:3000']

const host = process.env.MINIO_HOST || '127.0.0.1'
const port = process.env.MINIO_PORT || '9000'
const useSSL = (process.env.MINIO_USE_SSL === 'true' || process.env.MINIO_USE_SSL === '1')
const accessKey = process.env.MINIO_ACCESS_KEY || process.env.MINIO_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID
const secretKey = process.env.MINIO_SECRET_KEY || process.env.MINIO_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY

const endpoint = `${useSSL ? 'https' : 'http'}://${host}:${port}`

const corsConfig = {
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

const tmpPath = path.join(os.tmpdir(), `cors-${Date.now()}.json`)
fs.writeFileSync(tmpPath, JSON.stringify(corsConfig, null, 2), 'utf8')

function tryAwsCli() {
  try {
    execSync('aws --version', { stdio: 'ignore' })
    let cmd = `aws s3api put-bucket-cors --bucket ${bucket} --cors-configuration file://${tmpPath}`
    // If MINIO endpoint is provided, pass it to AWS CLI
    if (endpoint) cmd += ` --endpoint-url ${endpoint}`
    console.log('Applying CORS using AWS CLI...')
    execSync(cmd, { stdio: 'inherit', env: process.env })
    console.log('CORS applied successfully via AWS CLI')
    return true
  } catch (err) {
    return false
  }
}

function suggestMcInstructions() {
  console.log('mc (MinIO client) is available. You can run these commands:')
  console.log('  mc alias set myminio', endpoint, accessKey || '<ACCESS_KEY>', secretKey || '<SECRET_KEY>')
  console.log('  mc admin bucket cors set myminio/' + bucket + ' ' + tmpPath)
  console.log('If `mc` is not installed, see https://min.io/docs/minio/linux/reference/minio-mc.html')
}

function finalInstructions() {
  console.error('Unable to apply CORS automatically.')
  console.error('You can apply the configuration using the AWS CLI:')
  console.error(`  aws s3api put-bucket-cors --bucket ${bucket} --cors-configuration file://${tmpPath} --endpoint-url ${endpoint}`)
  console.error('Or install the MinIO client `mc` and run the commands shown by this script.')
}

// Try AWS SDK programmatically if available and credentials are present
async function tryProgrammaticSdk() {
  if (!S3Client || !PutBucketCorsCommand) return false
  if (!accessKey || !secretKey) return false
  try {
    const client = new S3Client({
      endpoint,
      region: process.env.AWS_REGION || 'us-east-1',
      credentials: { accessKeyId: accessKey, secretAccessKey: secretKey },
      forcePathStyle: true,
    })
    const cmd = new PutBucketCorsCommand({ Bucket: bucket, CORSConfiguration: corsConfig })
    await client.send(cmd)
    console.log('CORS applied successfully via AWS SDK')
    return true
  } catch (err) {
    console.error('AWS SDK put-bucket-cors failed:', err && err.message ? err.message : err)
    return false
  }
}

(async () => {
  try {
    if (await tryProgrammaticSdk()) {
      try { fs.unlinkSync(tmpPath) } catch (e) {}
      process.exit(0)
    }

    // Try AWS CLI
    if (tryAwsCli()) {
      try { fs.unlinkSync(tmpPath) } catch (e) {}
      process.exit(0)
    }

    // Try mc CLI for assisted instructions
    try {
      execSync('mc --version', { stdio: 'ignore' })
      suggestMcInstructions()
      try { fs.unlinkSync(tmpPath) } catch (e) {}
      process.exit(0)
    } catch (e) {
      finalInstructions()
      process.exit(1)
    }
  } catch (err) {
    console.error('Unexpected error in CORS helper:', err)
    try { fs.unlinkSync(tmpPath) } catch (e) {}
    process.exit(1)
  }
})()
