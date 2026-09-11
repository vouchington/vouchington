import { createTokenSecrets, parseEncryptionKeys } from '@vouchington/utils/token-secrets'

const ENCRYPTION_KEYS_ENV = 'VOUCHA_STORED_SECRET_ENCRYPTION_KEYS'

let cachedRawEncryptionKeys: string | undefined
let cachedTokenSecrets: ReturnType<typeof createTokenSecrets> | undefined

function getTokenSecrets(): ReturnType<typeof createTokenSecrets> {
  const value = process.env[ENCRYPTION_KEYS_ENV]?.trim()
  if (!value) throw new Error(`${ENCRYPTION_KEYS_ENV} is not set`)

  if (cachedRawEncryptionKeys === value && cachedTokenSecrets) return cachedTokenSecrets

  try {
    cachedTokenSecrets = createTokenSecrets({
      hashSecret: 'encryption-only',
      encryptionKeys: parseEncryptionKeys(value),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`${ENCRYPTION_KEYS_ENV}: ${message}`, { cause: error })
  }
  cachedRawEncryptionKeys = value
  return cachedTokenSecrets
}

export function encryptSecret(plaintext: string, purpose: string): string {
  return getTokenSecrets().encryptSecret(plaintext, purpose)
}

export function decryptSecret(encrypted: string, purpose: string): string {
  const parts = encrypted.split(':')
  if (parts.length !== 5 || parts[0] !== 'v1' || parts.some(part => !part)) {
    throw new Error('Invalid encrypted secret format')
  }
  return getTokenSecrets().decryptSecret(encrypted, purpose)
}
