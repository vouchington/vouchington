import { Batch, TimeUnit } from '@valkey/valkey-glide'
import { SESSION_EXPIRATION_SECONDS } from '@ts-shared/session-jwt'
import { sessionValkeyClient } from './clients.mts'
import { unlinkIfValueMatches } from './conditional.mts'

const STALE_PREFIX = 'voucha:jwt-stale:'

export function getJwtStaleKey(userId: string): string {
  return `${STALE_PREFIX}${userId}`
}

const JWT_STALE_SET_OPTIONS = {
  expiry: { type: TimeUnit.Seconds as const, count: SESSION_EXPIRATION_SECONDS },
}

/**
 * Mark a user's JWT claims as stale, forcing a DB recheck on the user's next
 * PATCH /api/v1/session call. Call this after any change to roles or membership.
 */
export async function markJwtStale(userId: string): Promise<string> {
  const marker = crypto.randomUUID()
  await setJwtStaleMarker(userId, marker)
  return marker
}

/**
 * Mark multiple users' JWT claims as stale in one Valkey round trip.
 * Returns the marker written for each unique user ID.
 */
export async function markJwtStaleBatch(userIds: readonly string[]): Promise<Map<string, string>> {
  const markersByUserId = new Map<string, string>()
  for (const userId of userIds) {
    if (!markersByUserId.has(userId)) markersByUserId.set(userId, crypto.randomUUID())
  }

  if (markersByUserId.size === 0) return markersByUserId

  if (markersByUserId.size === 1) {
    const [userId, marker] = markersByUserId.entries().next().value!
    await setJwtStaleMarker(userId, marker)
    return markersByUserId
  }

  const batch = new Batch(false)
  for (const [userId, marker] of markersByUserId) {
    batch.set(getJwtStaleKey(userId), marker, JWT_STALE_SET_OPTIONS)
  }
  await sessionValkeyClient.exec(batch, true)
  return markersByUserId
}

/** Returns true if the user's JWT claims are marked stale. */
export async function isJwtStale(userId: string): Promise<boolean> {
  const result = await sessionValkeyClient.get(getJwtStaleKey(userId))
  return result !== null
}

/** Clear the stale flag after re-issuing enriched tokens. */
export async function clearJwtStale(userId: string): Promise<void> {
  await sessionValkeyClient.unlink([getJwtStaleKey(userId)])
}

/** Clear the stale flag only if no newer invalidation has replaced it. */
export async function clearJwtStaleIfCurrent(
  userId: string,
  expectedMarker: string,
): Promise<boolean> {
  return await unlinkIfValueMatches(getJwtStaleKey(userId), expectedMarker, {
    client: sessionValkeyClient,
  })
}

async function setJwtStaleMarker(userId: string, marker: string): Promise<void> {
  await sessionValkeyClient.set(getJwtStaleKey(userId), marker, JWT_STALE_SET_OPTIONS)
}
