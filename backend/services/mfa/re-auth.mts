import { randomUUID } from 'node:crypto'
import { sessionValkeyClient } from '@data-stores/valkey/clients'
import { getAndDelete } from '@data-stores/valkey/idempotency-key'
import { TimeUnit } from '@valkey/valkey-glide'
import { isUUID } from '@ts-shared/utils/validation-core'

const REAUTH_TTL_SECONDS = 300 // 5 minutes
const KEY_PREFIX = 'mfa-reauth'

export async function createReAuthToken(userId: string): Promise<string> {
  const token = randomUUID()
  await sessionValkeyClient.set(`${KEY_PREFIX}:${userId}:${token}`, '1', {
    expiry: { type: TimeUnit.Seconds, count: REAUTH_TTL_SECONDS },
  })
  return token
}

export async function verifyAndDeleteReAuthToken(userId: string, token: string): Promise<boolean> {
  if (!isUUID(token)) return false

  const result = await getAndDelete(`${KEY_PREFIX}:${userId}:${token}`, {
    client: sessionValkeyClient,
  })
  return result !== null
}
