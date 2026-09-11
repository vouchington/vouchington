import { sessionValkeyClient } from '@data-stores/valkey/clients'
import { TimeUnit } from '@valkey/valkey-glide'

const KEY_PREFIX = 'app-attest-req-nonce'
// 2× the timestamp tolerance: covers the full validity window of a future-skewed timestamp
const NONCE_TTL_SECONDS = 600

/**
 * Record a per-request nonce using Valkey NX SET to prevent replay attacks.
 * Returns true if the nonce is fresh (first use), false if it has been seen before.
 */
export async function checkAndStoreRequestNonce(keyId: string, nonce: string): Promise<boolean> {
  const canonicalKeyId = Buffer.from(keyId, 'base64').toString('base64')
  const key = `${KEY_PREFIX}:${canonicalKeyId}:${nonce}`
  const result = await sessionValkeyClient.set(key, '1', {
    conditionalSet: 'onlyIfDoesNotExist',
    expiry: { type: TimeUnit.Seconds, count: NONCE_TTL_SECONDS },
  })
  return result !== null
}
