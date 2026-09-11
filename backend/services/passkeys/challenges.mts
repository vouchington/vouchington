import { sessionValkeyClient } from '@data-stores/valkey/clients'
import { getAndDelete } from '@data-stores/valkey/idempotency-key'
import { TimeUnit } from '@valkey/valkey-glide'

const CHALLENGE_TTL_SECONDS = 300 // 5 minutes
const KEY_PREFIX = 'passkey-challenge'

export async function storeChallenge(key: string, challenge: string): Promise<void> {
  await sessionValkeyClient.set(`${KEY_PREFIX}:${key}`, challenge, {
    expiry: { type: TimeUnit.Seconds, count: CHALLENGE_TTL_SECONDS },
  })
}

export async function getAndDeleteChallenge(key: string): Promise<string | null> {
  return await getAndDelete(`${KEY_PREFIX}:${key}`, {
    client: sessionValkeyClient,
  })
}
