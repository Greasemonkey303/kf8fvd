import path from 'path'
import { config as loadEnv } from 'dotenv'

;(process.env as Record<string, string | undefined>).NODE_ENV = 'test'

loadEnv({ path: path.resolve(process.cwd(), '.env.local'), quiet: true })

process.env.DISABLE_DB_FALLBACK = process.env.DISABLE_DB_FALLBACK || '1'