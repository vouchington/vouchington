import { Batch, TimeUnit } from '@valkey/valkey-glide'
import { sessionValkeyClient } from '@data-stores/valkey/clients'
import {
  ATTESTED_SESSION_EXPIRATION_SECONDS,
  SESSION_EXPIRATION_SECONDS,
} from '@ts-shared/session-jwt'
import { getJwtRevokedKey, getJwtUserRevokedBeforeKey } from './constants.mts'

export const REVOCATION_EXPIRATION_SECONDS = Math.max(
  SESSION_EXPIRATION_SECONDS,
  ATTESTED_SESSION_EXPIRATION_SECONDS,
)

const REVOCATION_EXPIRY = {
  expiry: { type: TimeUnit.Seconds as const, count: REVOCATION_EXPIRATION_SECONDS },
}

export async function revokeSessionKey(sessionId: string): Promise<void> {
  await sessionValkeyClient.set(getJwtRevokedKey(sessionId), '1', REVOCATION_EXPIRY)
}

export async function revokeSessionKeys(sessionIds: readonly string[]): Promise<void> {
  if (sessionIds.length === 0) return
  if (sessionIds.length === 1) {
    await revokeSessionKey(sessionIds[0]!)
    return
  }

  const batch = new Batch(false)
  for (const sessionId of sessionIds) {
    batch.set(getJwtRevokedKey(sessionId), '1', REVOCATION_EXPIRY)
  }
  await sessionValkeyClient.exec(batch, true)
}

export async function revokeUserSessionsBefore(
  userId: string,
  revokedBeforeSeconds = Math.floor(Date.now() / 1000),
): Promise<void> {
  await sessionValkeyClient.set(
    getJwtUserRevokedBeforeKey(userId),
    String(revokedBeforeSeconds),
    REVOCATION_EXPIRY,
  )
}

export async function getUserSessionsRevokedBefore(userId: string): Promise<number | null> {
  const value = await sessionValkeyClient.get(getJwtUserRevokedBeforeKey(userId))
  if (value === null) return null
  const revokedBeforeSeconds = Number(value)
  return Number.isFinite(revokedBeforeSeconds) ? revokedBeforeSeconds : null
}
