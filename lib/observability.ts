type LogLevel = 'debug' | 'info' | 'warn' | 'error'

import { recordObservedError } from './monitoringMetrics'

type LogContext = {
  route?: string
  action?: string
  actor?: string | null
  actorType?: string | null
  resourceId?: string | number | null
  reason?: string | null
  status?: number | null
  method?: string | null
  ip?: string | null
  [key: string]: unknown
}

function normalizeError(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: process.env.NODE_ENV === 'production' ? undefined : error.stack,
    }
  }

  if (typeof error === 'string') return { message: error }
  return { message: String(error) }
}

function shouldLog(level: LogLevel) {
  if (level !== 'debug') return true
  if (process.env.NODE_ENV !== 'production') return true
  return process.env.DEBUG_OBSERVABILITY === '1' || process.env.DEBUG_OBSERVABILITY === 'true'
}

function emit(level: LogLevel, payload: Record<string, unknown>) {
  if (!shouldLog(level)) return

  const message = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    ...payload,
  })

  if (level === 'debug') console.debug(message)
  else if (level === 'info') console.info(message)
  else if (level === 'warn') console.warn(message)
  else console.error(message)
}

export function logRouteEvent(level: LogLevel, context: LogContext) {
  emit(level, context)
  if (level === 'error') {
    void recordObservedError(context.route)
  }
}

export function logRouteError(route: string, error: unknown, context?: LogContext) {
  emit('error', {
    route,
    action: context?.action || 'error',
    ...context,
    error: normalizeError(error),
  })
  void recordObservedError(route)
}