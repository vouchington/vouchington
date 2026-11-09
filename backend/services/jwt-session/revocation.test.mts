import { it, expect, describe } from 'vitest'
import { sessionValkeyClient } from '@data-stores/valkey/clients'
import {
  ATTESTED_SESSION_EXPIRATION_SECONDS,
  SESSION_EXPIRATION_SECONDS,
} from '@ts-shared/session-jwt'
import { getJwtRevokedKey } from './constants.mts'
import { revokeSession, isSessionRevoked } from './revocation.mts'
import { withAbortedPostgresTransactionForTest } from '@voucha/test-helpers/postgres-aborted-transaction'
import { withRejectedPostgresQueryForTest } from '@voucha/test-helpers/injected-failures'
import { v7 } from 'uuid'
import { createTestUserDirect, softDeleteUser } from '@voucha/test-helpers/entities/users'
import { createDeviceAndSessionTokens } from './create.mts'
import {
  revokeAllAuthenticatedSessions,
  revokeAuthenticatedSession,
} from './user-session-revocation.mts'

describe('revocation', () => {
  it('isSessionRevoked returns false for a session that has not been revoked', async () => {
    const sid = v7()
    const result = await isSessionRevoked(sid)
    expect(result).toBe(false)
  })

  it('revokeSession marks session as revoked', async () => {
    const sid = v7()

    await revokeSession(sid)
    const result = await isSessionRevoked(sid)
    expect(result).toBe(true)
  })

  it('revokeSession is idempotent', async () => {
    const sid = v7()

    await revokeSession(sid)
    await revokeSession(sid)
    expect(await isSessionRevoked(sid)).toBe(true)
  })

  it('reports a failed durable write while still setting the revocation marker', async () => {
    const sid = v7()

    await expect(
      withRejectedPostgresQueryForTest(
        statement => statement.includes('/* updateSessionRevocationRegistry */'),
        'database unavailable',
        query => revokeSession(sid, { query }),
      ),
    ).rejects.toThrow('database unavailable')

    await expect(isSessionRevoked(sid)).resolves.toBe(true)
  })

  it('propagates the PostgreSQL failure for a strict registry write in an aborted transaction', async () => {
    const sid = v7()

    await expect(
      withAbortedPostgresTransactionForTest(options => revokeSession(sid, options)),
    ).rejects.toMatchObject({ code: '25P02' })
    await expect(isSessionRevoked(sid)).resolves.toBe(true)
  })

  it('revoking one session does not affect another session', async () => {
    const sid1 = v7()
    const sid2 = v7()

    await revokeSession(sid1)
    expect(await isSessionRevoked(sid1)).toBe(true)
    expect(await isSessionRevoked(sid2)).toBe(false)
  })

  it('uses the durable user cutoff after cache loss and permits a later authenticated SID', async () => {
    const { id: userId } = await createTestUserDirect()
    const revoked = await createDeviceAndSessionTokens({ uid: userId, did: v7() })
    const anonymous = await createDeviceAndSessionTokens({ did: v7() })

    await revokeAllAuthenticatedSessions(userId)
    await sessionValkeyClient.del([getJwtRevokedKey(revoked.sessionToken.payload.sid)])
    await expect(isSessionRevoked(revoked.sessionToken.payload.sid, { userId })).resolves.toBe(true)

    const replacement = await createDeviceAndSessionTokens({
      uid: userId,
      did: anonymous.deviceToken.payload.did,
      sid: anonymous.sessionToken.payload.sid,
    })
    await expect(isSessionRevoked(replacement.sessionToken.payload.sid, { userId })).resolves.toBe(
      false,
    )
  })

  it('rejects missing or deleted users when revoking sessions', async () => {
    const deleted = await createTestUserDirect()
    const session = await createDeviceAndSessionTokens({ uid: deleted.id, did: v7() })
    await softDeleteUser(deleted.id)
    const missingId = v7()

    for (const [userId, code] of [
      [deleted.id, '23514'],
      [missingId, 'P0002'],
    ] as const) {
      await expect(
        revokeAuthenticatedSession(userId, session.sessionToken.payload.sid),
      ).rejects.toMatchObject({ code })
      await expect(revokeAllAuthenticatedSessions(userId)).rejects.toMatchObject({ code })
    }
  })

  it('returns false when a live user has no matching session', async () => {
    const user = await createTestUserDirect()
    await expect(revokeAuthenticatedSession(user.id, v7())).resolves.toBe(false)
  })

  it('keeps revocation flags for the longest supported session lifetime', async () => {
    const sid = v7()
    const expectedTtlSeconds = Math.max(
      SESSION_EXPIRATION_SECONDS,
      ATTESTED_SESSION_EXPIRATION_SECONDS,
    )

    await revokeSession(sid)

    const ttlSeconds = await sessionValkeyClient.ttl(getJwtRevokedKey(sid))
    expect(ttlSeconds).toBeGreaterThan(SESSION_EXPIRATION_SECONDS)
    expect(ttlSeconds).toBeLessThanOrEqual(expectedTtlSeconds)
    expect(ttlSeconds).toBeGreaterThan(expectedTtlSeconds - 60)
  })
})
