import { createHmac, timingSafeEqual } from 'node:crypto'
import { parseApiKey, BRAND_PREFIX } from './format.mts'

function getSecret(): string {
  const secret = process.env.API_KEY_CHECKSUM_SECRET
  if (!secret) throw new Error('API_KEY_CHECKSUM_SECRET is not set')
  return secret
}

export function computeApiKeyChecksum(payload: string): string {
  // 16 hex chars = 64 bits; sufficient given HMAC preimage resistance and per-IP rate limits.
  return createHmac('sha256', getSecret()).update(payload).digest('hex').slice(0, 16)
}

export function validateApiKeyChecksum(rawKey: string): boolean {
  let parsed: ReturnType<typeof parseApiKey>

  try {
    parsed = parseApiKey(rawKey)
  } catch {
    return false
  }

  if (!parsed) return false
  if (!/^[0-9a-f]{16}$/i.test(parsed.checksum)) return false

  const payload = `${BRAND_PREFIX}${parsed.type}_${parsed.random}`
  try {
    const expected = computeApiKeyChecksum(payload)
    return timingSafeEqual(Buffer.from(parsed.checksum, 'hex'), Buffer.from(expected, 'hex'))
  } catch {
    return false
  }
}
