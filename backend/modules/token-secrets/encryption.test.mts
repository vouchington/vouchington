import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { decryptSecret, encryptSecret } from './encryption.mts'

const FAKE_KEY_SENTENCE = 'this fake test key is not secret'
const ENCRYPTION_KEYS = `test:raw32:${FAKE_KEY_SENTENCE}`
const ENCODED_FAKE_KEY_SENTENCE = Buffer.from(FAKE_KEY_SENTENCE).toString('base64url')

describe('stored secret encryption', () => {
  let previousEncryptionKeys: string | undefined

  beforeEach(() => {
    previousEncryptionKeys = process.env.VOUCHA_STORED_SECRET_ENCRYPTION_KEYS
    process.env.VOUCHA_STORED_SECRET_ENCRYPTION_KEYS = ENCRYPTION_KEYS
  })

  afterEach(() => {
    if (previousEncryptionKeys === undefined) {
      delete process.env.VOUCHA_STORED_SECRET_ENCRYPTION_KEYS
    } else {
      process.env.VOUCHA_STORED_SECRET_ENCRYPTION_KEYS = previousEncryptionKeys
    }
  })

  it('re-reads the configured keys when the env value changes', () => {
    process.env.VOUCHA_STORED_SECRET_ENCRYPTION_KEYS = ` new:raw32:${FAKE_KEY_SENTENCE} , old:base64url:${ENCODED_FAKE_KEY_SENTENCE} `

    const encrypted = encryptSecret('rotated-token', 'oauth:x:123:access_token')

    expect(encrypted.startsWith('v1:new:')).toBe(true)
    process.env.VOUCHA_STORED_SECRET_ENCRYPTION_KEYS = ` old:raw32:${FAKE_KEY_SENTENCE} , new:base64url:${ENCODED_FAKE_KEY_SENTENCE} `
    expect(decryptSecret(encrypted, 'oauth:x:123:access_token')).toBe('rotated-token')
  })

  it('rejects encrypted values with extra format segments', () => {
    const encrypted = encryptSecret('social-access-token', 'oauth:x:123:access_token')

    expect(() => decryptSecret(`${encrypted}:extra`, 'oauth:x:123:access_token')).toThrow(
      'Invalid encrypted secret format',
    )
  })

  it('rejects an invalid format version before checking configured keys', () => {
    const encrypted = encryptSecret('social-access-token', 'oauth:x:123:access_token')
    const parts = encrypted.split(':')
    parts[0] = 'v2'
    delete process.env.VOUCHA_STORED_SECRET_ENCRYPTION_KEYS

    expect(() => decryptSecret(parts.join(':'), 'oauth:x:123:access_token')).toThrow(
      'Invalid encrypted secret format',
    )
  })

  it('rejects an invalid format version before unknown-key lookup', () => {
    const encrypted = encryptSecret('social-access-token', 'oauth:x:123:access_token')
    const parts = encrypted.split(':')
    parts[0] = 'v2'
    parts[1] = 'unknown'

    expect(() => decryptSecret(parts.join(':'), 'oauth:x:123:access_token')).toThrow(
      'Invalid encrypted secret format',
    )
  })

  it('continues to reject empty ciphertext segments', () => {
    const encrypted = encryptSecret('social-access-token', 'oauth:x:123:access_token')
    const parts = encrypted.split(':')
    parts[4] = ''

    expect(() => decryptSecret(parts.join(':'), 'oauth:x:123:access_token')).toThrow(
      'Invalid encrypted secret format',
    )
  })

  it('requires configured keys', () => {
    delete process.env.VOUCHA_STORED_SECRET_ENCRYPTION_KEYS

    expect(() => encryptSecret('social-access-token', 'oauth:x:123:access_token')).toThrow(
      'VOUCHA_STORED_SECRET_ENCRYPTION_KEYS is not set',
    )
  })

  it('rejects malformed key entries', () => {
    process.env.VOUCHA_STORED_SECRET_ENCRYPTION_KEYS = 'missing-key-material:'

    expect(() => encryptSecret('social-access-token', 'oauth:x:123:access_token')).toThrow(
      'VOUCHA_STORED_SECRET_ENCRYPTION_KEYS: Encryption key entries must contain key material',
    )
  })
})
