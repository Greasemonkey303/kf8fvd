import { randomBytes, createCipheriv, createDecipheriv } from 'crypto'

const VERSION_PATTERN = /^[a-zA-Z0-9._-]{1,32}$/

function decodeKey(value: string | undefined, label: string) {
  const key = Buffer.from(value || '', 'base64')
  if (key.length !== 32) throw new Error(`${label} must be 32 bytes (base64)`)
  return key
}

function getCurrentVersion() {
  const version = String(process.env.ENCRYPTION_KEY_VERSION || 'v1').trim()
  if (!VERSION_PATTERN.test(version)) throw new Error('ENCRYPTION_KEY_VERSION is invalid')
  return version
}

function getPreviousKeys() {
  const raw = process.env.ENCRYPTION_PREVIOUS_KEYS
  if (!raw) return {} as Record<string, string>
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error('ENCRYPTION_PREVIOUS_KEYS must be a JSON object')
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('ENCRYPTION_PREVIOUS_KEYS must be a JSON object')
  return parsed as Record<string, string>
}

function getKeyForVersion(version: string | null) {
  const currentVersion = getCurrentVersion()
  if (version === null || version === currentVersion) return decodeKey(process.env.ENCRYPTION_KEY, 'ENCRYPTION_KEY')

  const previous = getPreviousKeys()
  if (!Object.prototype.hasOwnProperty.call(previous, version)) throw new Error(`Encryption key version is unavailable: ${version}`)
  return decodeKey(previous[version], `ENCRYPTION_PREVIOUS_KEYS.${version}`)
}

function splitCiphertext(ciphertext: string) {
  const separator = ciphertext.indexOf(':')
  if (separator < 1) return { version: null, payload: ciphertext }
  const version = ciphertext.slice(0, separator)
  if (!VERSION_PATTERN.test(version)) return { version: null, payload: ciphertext }
  return { version, payload: ciphertext.slice(separator + 1) }
}

export function encrypt(plaintext: string): string {
  const version = getCurrentVersion()
  const key = getKeyForVersion(version)
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${version}:${Buffer.concat([iv, tag, encrypted]).toString('base64')}`
}

export function decrypt(ciphertext: string): string {
  const { version, payload } = splitCiphertext(ciphertext)
  const key = getKeyForVersion(version)
  const data = Buffer.from(payload, 'base64')
  if (data.length < 29) throw new Error('Encrypted value is invalid')
  const iv = data.subarray(0, 12)
  const tag = data.subarray(12, 28)
  const encrypted = data.subarray(28)
  const decipher = createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()])
  return decrypted.toString('utf8')
}

export function needsReEncryption(ciphertext: string) {
  return splitCiphertext(ciphertext).version !== getCurrentVersion()
}

export function reEncrypt(ciphertext: string) {
  return encrypt(decrypt(ciphertext))
}

export function generateKeyBase64(): string {
  return randomBytes(32).toString('base64')
}

const encryption = { encrypt, decrypt, needsReEncryption, reEncrypt, generateKeyBase64 }
export default encryption
