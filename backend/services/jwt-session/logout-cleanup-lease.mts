import { createHash } from 'node:crypto'
import { TimeUnit } from '@valkey/valkey-glide'
import { sessionValkeyClient } from '@data-stores/valkey/clients'
import { releaseIdempotencyKey, reserveIdempotencyKey } from '@data-stores/valkey/idempotency-key'
import onError from '@modules/on-error'
import {
  admitLogoutCleanupScript,
  commitLogoutRevocationScript,
  getJwtLogoutCleanupAdmissionKey,
  getJwtLogoutCleanupFenceKey,
  getJwtLogoutCleanupKey,
  getJwtLogoutPushCleanupCompletionKey,
  getJwtRevokedKey,
  getJwtUserRevokedBeforeKey,
} from './constants.mts'
import { REVOCATION_EXPIRATION_SECONDS } from './session-revocation-keys.mts'
import { revokeSession } from './user-sessions.mts'

// Production PostgreSQL statements are bounded at 30s. Cleanup and its following registry write
// can run serially, so the lease exceeds both bounds with room for the Valkey operations.
const LOGOUT_CLEANUP_LEASE_SECONDS = 90
const LOGOUT_CLEANUP_WAIT_ATTEMPTS = 20
const LOGOUT_CLEANUP_WAIT_MS = 250

type SessionRevocationOptions = {
  userId: string
  issuedAt?: number
}

type ExactPushBinding = { endpoint: string; subscriptionId: string }

export const logoutCleanupLease = {
  keyFor: getJwtLogoutCleanupKey,
  reserve: (sessionId: string, ttlSeconds = LOGOUT_CLEANUP_LEASE_SECONDS, token?: string) =>
    reserveIdempotencyKey(getJwtLogoutCleanupKey(sessionId), ttlSeconds, {
      client: sessionValkeyClient,
      token,
    }),
  release: (sessionId: string, token: string) =>
    releaseIdempotencyKey(getJwtLogoutCleanupKey(sessionId), token, {
      client: sessionValkeyClient,
    }),
}

/**
 * Serializes push cleanup without treating a lease as durable logout completion. The revocation
 * marker is written only after cleanup, so an expired owner lease can be recovered by a replay.
 */
export async function runLogoutPushCleanupAndRevoke(
  sessionId: string,
  revocationOptions: SessionRevocationOptions,
  cleanup: () => Promise<void>,
  exactBinding?: ExactPushBinding,
): Promise<void> {
  const admitted = await admitLogoutCleanup(sessionId, revocationOptions)
  if (!admitted) return
  return attempt()

  async function attempt(attemptNumber = 0): Promise<void> {
    const completionKey = exactBinding
      ? getJwtLogoutPushCleanupCompletionKey(sessionId, digestExactPushBinding(exactBinding))
      : undefined
    if (completionKey && (await sessionValkeyClient.get(completionKey)) !== null) {
      await commitLogoutRevocation(sessionId)
      return
    }

    const reservation = await logoutCleanupLease.reserve(sessionId)
    if (reservation.state === 'reserved') {
      try {
        if (completionKey && (await sessionValkeyClient.get(completionKey)) !== null) {
          await commitLogoutRevocation(sessionId)
          return
        }
        await cleanup()
        if (completionKey) {
          await sessionValkeyClient.set(completionKey, '1', {
            conditionalSet: 'onlyIfDoesNotExist',
            expiry: { type: TimeUnit.Seconds, count: REVOCATION_EXPIRATION_SECONDS },
          })
        }
        await commitLogoutRevocation(sessionId)
      } finally {
        await logoutCleanupLease
          .release(sessionId, reservation.token)
          .catch(error => onError(error instanceof Error ? error : new Error(String(error))))
      }
      return
    }

    if (attemptNumber + 1 < LOGOUT_CLEANUP_WAIT_ATTEMPTS) {
      await delay(LOGOUT_CLEANUP_WAIT_MS)
      return attempt(attemptNumber + 1)
    }

    throw new Error('logout push cleanup is already in progress')
  }
}

async function admitLogoutCleanup(
  sessionId: string,
  revocationOptions: SessionRevocationOptions,
): Promise<boolean> {
  const result = await sessionValkeyClient.invokeScript(admitLogoutCleanupScript, {
    keys: [
      getJwtLogoutCleanupAdmissionKey(sessionId),
      getJwtLogoutCleanupFenceKey(sessionId),
      getJwtRevokedKey(sessionId),
      getJwtUserRevokedBeforeKey(revocationOptions.userId),
    ],
    args: [
      String(REVOCATION_EXPIRATION_SECONDS),
      String(revocationOptions.issuedAt ?? Number.MAX_SAFE_INTEGER),
    ],
  })
  if (!Array.isArray(result) || result.length < 2 || Number(result[1]) === 0) return false
  if (!Number.isSafeInteger(Number(result[0]))) {
    throw new Error('logout cleanup admission returned an invalid sequence')
  }
  return true
}

async function commitLogoutRevocation(sessionId: string): Promise<void> {
  await sessionValkeyClient.invokeScript(commitLogoutRevocationScript, {
    keys: [
      getJwtLogoutCleanupAdmissionKey(sessionId),
      getJwtLogoutCleanupFenceKey(sessionId),
      getJwtRevokedKey(sessionId),
    ],
    args: [String(REVOCATION_EXPIRATION_SECONDS)],
  })
  await revokeSession(sessionId, { registryFailureMode: 'ignore' })
}

function digestExactPushBinding(binding: ExactPushBinding): string {
  return createHash('sha256')
    .update(binding.endpoint)
    .update('\0')
    .update(binding.subscriptionId)
    .digest('hex')
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
