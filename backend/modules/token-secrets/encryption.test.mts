import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { decryptSecret, encryptSecret } from './encryption.mts'

const FAKE_KEY_SENTENCE = 'this fake test key is not secret'
const FAKE_KEY_SENTENCE_WITH_COLON = 'this fake:test key is not secret'
const ENCRYPTION_KEYS = `test:raw32:${FAKE_KEY_SENTENCE}`
const ENCODED_FAKE_KEY_SENTENCE = Buffer.from(FAKE_KEY_SENTENCE).toString('base64url')
const LEGACY_ENCRYPTED_SECRET =
  'v1:test:AAECAwQFBgcICQoL:Iec1uuDdzTVJbTf0ply0MQ:mMrOC7J77dsDJCO2Zclh_6dmaA'

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

  it('round-trips plaintext without storing it directly', () => {
    const encrypted = encryptSecret('social-access-token', 'oauth:github:123:access_token')

    expect(encrypted).toMatch(/^v1:test:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+$/)
    expect(encrypted).not.toContain('social-access-token')
    expect(decryptSecret(encrypted, 'oauth:github:123:access_token')).toBe('social-access-token')
  })

  it('decrypts ciphertext created by the legacy implementation', () => {
    expect(decryptSecret(LEGACY_ENCRYPTED_SECRET, 'oauth:github:123:access_token')).toBe(
      'social-access-token',
    )
  })

  it('trims comma-separated key entries and key ids for rotation', () => {
    process.env.VOUCHA_STORED_SECRET_ENCRYPTION_KEYS = ` new:raw32:${FAKE_KEY_SENTENCE} , old:base64url:${ENCODED_FAKE_KEY_SENTENCE} `

    const encrypted = encryptSecret('rotated-token', 'oauth:x:123:access_token')

    expect(encrypted.startsWith('v1:new:')).toBe(true)
    process.env.VOUCHA_STORED_SECRET_ENCRYPTION_KEYS = ` old:raw32:${FAKE_KEY_SENTENCE} , new:base64url:${ENCODED_FAKE_KEY_SENTENCE} `
    expect(decryptSecret(encrypted, 'oauth:x:123:access_token')).toBe('rotated-token')
  })

  it('allows colons inside raw32 fake key sentences', () => {
    process.env.VOUCHA_STORED_SECRET_ENCRYPTION_KEYS = `test:raw32:${FAKE_KEY_SENTENCE_WITH_COLON}`

    const encrypted = encryptSecret('colon-token', 'oauth:x:123:access_token')

    expect(decryptSecret(encrypted, 'oauth:x:123:access_token')).toBe('colon-token')
  })

  it('rejects unsafe key ids instead of remapping them', () => {
    process.env.VOUCHA_STORED_SECRET_ENCRYPTION_KEYS = `legacy.key:raw32:${FAKE_KEY_SENTENCE}`

    expect(() => encryptSecret('legacy-token', 'oauth:x:123:access_token')).toThrow(
      'VOUCHA_STORED_SECRET_ENCRYPTION_KEYS: Encryption key entries must use a non-empty safe key id',
    )
  })

  it('rejects duplicate key ids instead of keeping the first occurrence', () => {
    process.env.VOUCHA_STORED_SECRET_ENCRYPTION_KEYS = `test:raw32:${FAKE_KEY_SENTENCE}, test:base64url:${ENCODED_FAKE_KEY_SENTENCE}`

    expect(() => encryptSecret('legacy-token', 'oauth:x:123:access_token')).toThrow(
      'VOUCHA_STORED_SECRET_ENCRYPTION_KEYS: Encryption key ids must be unique',
    )
  })

  it('binds ciphertext to its purpose', () => {
    const encrypted = encryptSecret('totp-secret', 'totp-secret:user-1')

    expect(() => decryptSecret(encrypted, 'totp-secret:user-2')).toThrow(/authenticate/)
  })

  it('rejects tampered ciphertext', () => {
    const encrypted = encryptSecret('social-access-token', 'oauth:x:123:access_token')
    const parts = encrypted.split(':')
    parts[4] = `${parts[4]}A`

    expect(() => decryptSecret(parts.join(':'), 'oauth:x:123:access_token')).toThrow(/authenticate/)
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

  it('rejects noncanonical base64url ciphertext segments', () => {
    const encrypted = encryptSecret('social-access-token', 'oauth:x:123:access_token')
    const parts = encrypted.split(':')
    parts[2] = `${parts[2]}!`

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

  it('includes the key id in wrong-length errors', () => {
    process.env.VOUCHA_STORED_SECRET_ENCRYPTION_KEYS = 'legacy-key:raw32:too-short'

    expect(() => encryptSecret('social-access-token', 'oauth:x:123:access_token')).toThrow(
      'VOUCHA_STORED_SECRET_ENCRYPTION_KEYS: Encryption key legacy-key must be 32 bytes',
    )
  })

  it('rejects empty raw32 key material', () => {
    process.env.VOUCHA_STORED_SECRET_ENCRYPTION_KEYS = 'legacy-key:raw32:'

    expect(() => encryptSecret('social-access-token', 'oauth:x:123:access_token')).toThrow(
      'VOUCHA_STORED_SECRET_ENCRYPTION_KEYS: Encryption key entries must contain key material',
    )
  })
})
