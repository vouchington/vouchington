import { createTokenSecrets } from '@vouchington/utils/token-secrets'

const HASH_ENV = 'VOUCHA_OTP_TOKEN_HASH_SECRET'
const HASH_ONLY_ENCRYPTION_KEY = { id: 'hash-only', key: Buffer.alloc(32) }

let cachedHashSecret: string | undefined
let cachedTokenSecrets: ReturnType<typeof createTokenSecrets> | undefined

function getHashSecret(): string {
  const secret = process.env[HASH_ENV]?.trim()
  if (!secret) throw new Error(`${HASH_ENV} is not set`)
  return secret
}

export function hashToken(purpose: string, token: string): string {
  const hashSecret = getHashSecret()
  if (cachedHashSecret !== hashSecret || !cachedTokenSecrets) {
    cachedHashSecret = hashSecret
    cachedTokenSecrets = createTokenSecrets({
      hashSecret,
      encryptionKeys: [HASH_ONLY_ENCRYPTION_KEY],
    })
  }
  return cachedTokenSecrets.hashToken(purpose, token)
}
