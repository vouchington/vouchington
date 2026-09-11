import { randomBytes, createHash } from 'node:crypto'
import { formatApiKey, BRAND_PREFIX, type ApiKeyType } from './format.mts'
import { computeApiKeyChecksum } from './checksum.mts'

export function generateApiKey(type: ApiKeyType): {
  rawKey: string
  prefix: string
  keyHash: Buffer
  type: ApiKeyType
} {
  const random = randomBytes(16).toString('hex')
  const payload = `${BRAND_PREFIX}${type}_${random}`
  const checksum = computeApiKeyChecksum(payload)
  const rawKey = formatApiKey(type, random, checksum)
  const prefix = `${BRAND_PREFIX}${type}_${random.slice(0, 4)}`
  const keyHash = createHash('sha256').update(rawKey).digest()
  return { rawKey, prefix, keyHash, type }
}

export function hashApiKey(rawKey: string): Buffer {
  return createHash('sha256').update(rawKey).digest()
}
