import { afterEach, describe, expect, it } from 'vitest'
import { decrypt, encrypt, generateKeyBase64, needsReEncryption, reEncrypt } from '@/lib/encryption'

const originalKey = process.env.ENCRYPTION_KEY
const originalVersion = process.env.ENCRYPTION_KEY_VERSION
const originalPrevious = process.env.ENCRYPTION_PREVIOUS_KEYS

afterEach(() => {
  if (originalKey === undefined) delete process.env.ENCRYPTION_KEY
  else process.env.ENCRYPTION_KEY = originalKey
  if (originalVersion === undefined) delete process.env.ENCRYPTION_KEY_VERSION
  else process.env.ENCRYPTION_KEY_VERSION = originalVersion
  if (originalPrevious === undefined) delete process.env.ENCRYPTION_PREVIOUS_KEYS
  else process.env.ENCRYPTION_PREVIOUS_KEYS = originalPrevious
})

describe('versioned encryption', () => {
  it('round trips with the current key version', () => {
    process.env.ENCRYPTION_KEY = generateKeyBase64()
    process.env.ENCRYPTION_KEY_VERSION = 'v2'
    const ciphertext = encrypt('station secret')

    expect(ciphertext.startsWith('v2:')).toBe(true)
    expect(decrypt(ciphertext)).toBe('station secret')
    expect(needsReEncryption(ciphertext)).toBe(false)
  })

  it('decrypts an older version and re-encrypts with the current key', () => {
    const oldKey = generateKeyBase64()
    process.env.ENCRYPTION_KEY = oldKey
    process.env.ENCRYPTION_KEY_VERSION = 'v1'
    const oldCiphertext = encrypt('rotate me')

    process.env.ENCRYPTION_KEY = generateKeyBase64()
    process.env.ENCRYPTION_KEY_VERSION = 'v2'
    process.env.ENCRYPTION_PREVIOUS_KEYS = JSON.stringify({ v1: oldKey })

    expect(decrypt(oldCiphertext)).toBe('rotate me')
    expect(needsReEncryption(oldCiphertext)).toBe(true)
    const currentCiphertext = reEncrypt(oldCiphertext)
    expect(currentCiphertext.startsWith('v2:')).toBe(true)
    expect(decrypt(currentCiphertext)).toBe('rotate me')
  })
})
