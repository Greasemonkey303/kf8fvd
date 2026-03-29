import { NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { createObjectStorageClient, getObjectStorageBucket } from '@/lib/objectStorage'
import { getRedis } from '@/lib/rateLimiter'
import { getRedisUrl } from '@/lib/rateLimiterConfig'

type DependencyStatus = {
  ok: boolean
  error?: string
  latencyMs?: number
}

const HEALTH_TIMEOUT_MS = 1500

function collectMissingConfig() {
  const required = [
    'NEXTAUTH_SECRET',
    'NEXT_PUBLIC_S3_BUCKET',
    'DB_HOST',
    'DB_USER',
    'DB_NAME',
  ]

  const missing: string[] = []
  for (const key of required) {
    if (!process.env[key]) missing.push(key)
  }

  try {
    getRedisUrl()
  } catch {
    missing.push('REDIS_URL')
  }

  return missing
}

async function withTimeout<T>(label: string, operation: () => Promise<T>, timeoutMs: number): Promise<T> {
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs)
  })

  try {
    return await Promise.race([operation(), timeoutPromise])
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle)
  }
}

async function probeDependency(label: string, operation: () => Promise<void>): Promise<DependencyStatus> {
  const startedAt = Date.now()
  try {
    await withTimeout(label, operation, HEALTH_TIMEOUT_MS)
    return { ok: true, latencyMs: Date.now() - startedAt }
  } catch (error) {
    return {
      ok: false,
      latencyMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

async function buildHealthPayload() {
  const missing = collectMissingConfig()

  const dependencies = {
    mysql: await probeDependency('mysql', async () => {
      await query('SELECT 1 AS ok')
    }),
    redis: await probeDependency('redis', async () => {
      const redis = await getRedis()
      if (!redis) throw new Error('Redis client unavailable')
      if (typeof redis.exists !== 'function') throw new Error('Redis exists probe unavailable')
      await redis.exists('health:probe:missing')
    }),
    objectStorage: await probeDependency('objectStorage', async () => {
      const bucket = getObjectStorageBucket()
      if (!bucket) throw new Error('Object storage bucket not configured')
      const client = createObjectStorageClient()
      const exists = await client.bucketExists(bucket)
      if (!exists) throw new Error(`Bucket not found: ${bucket}`)
    }),
  }

  const ok = missing.length === 0 && Object.values(dependencies).every((dependency) => dependency.ok)

  return {
    ok,
    missing,
    timeoutMs: HEALTH_TIMEOUT_MS,
    dependencies,
  }
}

export async function GET() {
  const payload = await buildHealthPayload()
  return NextResponse.json(payload, { status: payload.ok ? 200 : 503 })
}

export async function HEAD() {
  const payload = await buildHealthPayload()
  return new NextResponse(null, { status: payload.ok ? 200 : 503 })
}
