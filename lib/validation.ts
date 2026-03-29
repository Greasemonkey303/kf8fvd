import { NextResponse } from 'next/server'

export type ValidationIssue = {
  field: string
  message: string
}

export class RequestValidationError extends Error {
  issues: ValidationIssue[]

  constructor(issues: ValidationIssue[] | ValidationIssue) {
    const list = Array.isArray(issues) ? issues : [issues]
    super(list[0]?.message || 'Validation failed')
    this.name = 'RequestValidationError'
    this.issues = list
  }
}

function issue(field: string, message: string): never {
  throw new RequestValidationError({ field, message })
}

export function validationErrorResponse(error: unknown) {
  if (error instanceof RequestValidationError) {
    return NextResponse.json({ error: 'Validation failed', details: error.issues }, { status: 400 })
  }
  return null
}

export async function parseJsonObject(req: Request) {
  try {
    const body = await req.json()
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      issue('body', 'Request body must be a JSON object')
    }
    return body as Record<string, unknown>
  } catch (error) {
    if (error instanceof RequestValidationError) throw error
    issue('body', 'Invalid JSON body')
  }
}

type StringOptions = {
  required?: boolean
  trim?: boolean
  maxLength?: number
  minLength?: number
  pattern?: RegExp
  allowEmpty?: boolean
}

export function readString(body: Record<string, unknown>, field: string, options?: StringOptions) {
  const value = body[field]
  if (value === undefined || value === null) {
    if (options?.required) issue(field, `${field} is required`)
    return null
  }
  if (typeof value !== 'string') issue(field, `${field} must be a string`)
  const normalized = options?.trim === false ? value : value.trim()
  if (!options?.allowEmpty && normalized.length === 0) {
    if (options?.required) issue(field, `${field} is required`)
    return null
  }
  if (options?.minLength && normalized.length < options.minLength) issue(field, `${field} is too short`)
  if (options?.maxLength && normalized.length > options.maxLength) issue(field, `${field} is too long`)
  if (options?.pattern && !options.pattern.test(normalized)) issue(field, `${field} is invalid`)
  return normalized
}

type NumberOptions = {
  required?: boolean
  integer?: boolean
  min?: number
  max?: number
}

export function readNumber(body: Record<string, unknown>, field: string, options?: NumberOptions) {
  const value = body[field]
  if (value === undefined || value === null || value === '') {
    if (options?.required) issue(field, `${field} is required`)
    return null
  }
  const normalized = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(normalized)) issue(field, `${field} must be a number`)
  if (options?.integer && !Number.isInteger(normalized)) issue(field, `${field} must be an integer`)
  if (options?.min !== undefined && normalized < options.min) issue(field, `${field} is too small`)
  if (options?.max !== undefined && normalized > options.max) issue(field, `${field} is too large`)
  return normalized
}

export function readBoolean(body: Record<string, unknown>, field: string) {
  const value = body[field]
  if (value === undefined || value === null || value === '') return null
  if (typeof value === 'boolean') return value
  if (value === 1 || value === '1' || value === 'true' || value === 'on') return true
  if (value === 0 || value === '0' || value === 'false' || value === 'off') return false
  issue(field, `${field} must be a boolean`)
}

export function readStringArray(body: Record<string, unknown>, field: string, options?: { allowedValues?: string[]; maxItems?: number }) {
  const value = body[field]
  if (value === undefined || value === null) return null
  if (!Array.isArray(value)) issue(field, `${field} must be an array`)
  const normalized = value.map((entry, index) => {
    if (typeof entry !== 'string') issue(`${field}[${index}]`, `${field}[${index}] must be a string`)
    return entry.trim()
  })
  if (options?.maxItems !== undefined && normalized.length > options.maxItems) issue(field, `${field} has too many items`)
  if (options?.allowedValues) {
    for (const entry of normalized) {
      if (!options.allowedValues.includes(entry)) issue(field, `${field} contains an invalid value`)
    }
  }
  return normalized
}

export function readNumberArray(body: Record<string, unknown>, field: string, options?: { integer?: boolean; min?: number; max?: number; maxItems?: number }) {
  const value = body[field]
  if (value === undefined || value === null) return null
  if (!Array.isArray(value)) issue(field, `${field} must be an array`)
  if (options?.maxItems !== undefined && value.length > options.maxItems) issue(field, `${field} has too many items`)
  return value.map((entry, index) => {
    const normalized = typeof entry === 'number' ? entry : Number(entry)
    if (!Number.isFinite(normalized)) issue(`${field}[${index}]`, `${field}[${index}] must be a number`)
    if (options?.integer && !Number.isInteger(normalized)) issue(`${field}[${index}]`, `${field}[${index}] must be an integer`)
    if (options?.min !== undefined && normalized < options.min) issue(`${field}[${index}]`, `${field}[${index}] is too small`)
    if (options?.max !== undefined && normalized > options.max) issue(`${field}[${index}]`, `${field}[${index}] is too large`)
    return normalized
  })
}

export function readEnumString(body: Record<string, unknown>, field: string, allowedValues: string[], options?: { required?: boolean }) {
  const value = readString(body, field, { required: options?.required, allowEmpty: false })
  if (!value) return null
  if (!allowedValues.includes(value)) issue(field, `${field} contains an invalid value`)
  return value
}

export function readUrlString(body: Record<string, unknown>, field: string, options?: { allowRelative?: boolean; maxLength?: number }) {
  const value = readString(body, field, { required: false, maxLength: options?.maxLength ?? 2048 })
  if (!value) return null
  try {
    new URL(value, options?.allowRelative ? 'http://example.com' : undefined)
  } catch {
    issue(field, `${field} must be a valid URL`)
  }
  return value
}

export function assertAtLeastOneField(body: Record<string, unknown>, fields: string[]) {
  const hasAny = fields.some((field) => body[field] !== undefined)
  if (!hasAny) issue('body', `At least one of these fields is required: ${fields.join(', ')}`)
}
