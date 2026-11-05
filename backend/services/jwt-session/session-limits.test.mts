import { beginTransaction } from '@data-stores/psql'
import type { TransactionQuery } from '@data-stores/psql/types'
import { sessionValkeyClient } from '@data-stores/valkey/clients'
import { createTestUser, getTestUserSessionById, insertTestUserSession } from '@voucha/test-helpers'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { describe, expect, it, onTestFinished } from 'vitest'
import { v7 } from 'uuid'
import { getJwtRevokedKey } from './constants.mts'
import { sessionLimitsConfig, sessionLimitsMaxValues } from './session-limits-config.mts'
import { registerAuthenticatedSession } from './user-sessions.mts'

async function registerTestSession(
  userId: string,
  sid: string,
  options: { query?: TransactionQuery; did?: string; expiresAt?: Date } = {},
) {
  await registerAuthenticatedSession(
    {
      uid: userId,
      sid,
      did: options.did ?? v7(),
      expiresAt: options.expiresAt ?? new Date(Date.now() + 60_000),
    },
    options.query ? { query: options.query } : undefined,
  )
}

async function setTestLimit(limit: number): Promise<void> {
  await sessionLimitsConfig.waitForInitialization()
  onTestFinished(
    overrideDynamicConfigFieldsForTest(sessionLimitsConfig, { active_sessions_per_user: limit }),
  )
}

describe('active user session limit', () => {
  it('sets a default of 100 and a hard maximum of 1,000', () => {
    expect(sessionLimitsConfig.defaultFields).toEqual({ active_sessions_per_user: 100 })
    expect(sessionLimitsMaxValues.active_sessions_per_user).toBe(1_000)
  })

  it('revokes the oldest session and writes its revocation key after commit', async () => {
    await setTestLimit(2)
    const user = await createTestUser()
    const first = v7()
    const second = v7()
    const third = v7()
    await registerTestSession(user.id, first)
    await registerTestSession(user.id, second)
    await registerTestSession(user.id, third)

    expect((await getTestUserSessionById(first))?.revoked_at).not.toBeNull()
    expect((await getTestUserSessionById(second))?.revoked_at).toBeNull()
    expect((await getTestUserSessionById(third))?.revoked_at).toBeNull()
    await expect(sessionValkeyClient.get(getJwtRevokedKey(first))).resolves.toBe('1')
  })

  it('applies a lower runtime limit on the next new session, not an existing refresh', async () => {
    await setTestLimit(3)
    const user = await createTestUser()
    const first = v7()
    const second = v7()
    const third = v7()
    const secondDeviceId = v7()
    await registerTestSession(user.id, first)
    await registerTestSession(user.id, second, {
      did: secondDeviceId,
      expiresAt: new Date(Date.now() + 30_000),
    })
    await registerTestSession(user.id, third)

    sessionLimitsConfig.fields.set('active_sessions_per_user', 1)
    await registerTestSession(user.id, second, { did: secondDeviceId })
    expect((await getTestUserSessionById(second))?.expires_at.getTime()).toBeGreaterThan(
      Date.now() + 45_000,
    )
    expect((await getTestUserSessionById(first))?.revoked_at).toBeNull()
    expect((await getTestUserSessionById(third))?.revoked_at).toBeNull()

    const fourth = v7()
    await registerTestSession(user.id, fourth)
    for (const sid of [first, second, third]) {
      expect((await getTestUserSessionById(sid))?.revoked_at).not.toBeNull()
      await expect(sessionValkeyClient.get(getJwtRevokedKey(sid))).resolves.toBe('1')
    }
    expect((await getTestUserSessionById(fourth))?.revoked_at).toBeNull()
  })

  it('keeps a newly registered SID that was minted before other active sessions', async () => {
    await setTestLimit(2)
    const user = await createTestUser()
    const preallocated = v7()
    const first = v7()
    const second = v7()
    await registerTestSession(user.id, first)
    await registerTestSession(user.id, second)
    await registerTestSession(user.id, preallocated)

    expect((await getTestUserSessionById(preallocated))?.revoked_at).toBeNull()
    expect((await getTestUserSessionById(second))?.revoked_at).toBeNull()
    expect((await getTestUserSessionById(first))?.revoked_at).not.toBeNull()
  })

  it('applies the limit when an expired session ID becomes active again', async () => {
    await setTestLimit(1)
    const user = await createTestUser()
    const expired = v7()
    const existing = v7()
    const expiredRow = await insertTestUserSession({
      userId: user.id,
      sessionId: expired,
      expiresAt: new Date(Date.now() - 60_000),
    })
    await registerTestSession(user.id, existing)
    await registerTestSession(user.id, expired, { did: expiredRow.device_id })

    expect((await getTestUserSessionById(expired))?.revoked_at).toBeNull()
    expect((await getTestUserSessionById(expired))?.expires_at.getTime()).toBeGreaterThan(
      Date.now(),
    )
    expect((await getTestUserSessionById(existing))?.revoked_at).not.toBeNull()
  })

  it('serializes concurrent new sessions under the per-user lock', async () => {
    await setTestLimit(1)
    const user = await createTestUser()
    const first = v7()
    const second = v7()
    await Promise.all([registerTestSession(user.id, first), registerTestSession(user.id, second)])

    const states = await Promise.all([
      getTestUserSessionById(first),
      getTestUserSessionById(second),
    ])
    expect(states.every(Boolean)).toBe(true)
    const active = states.filter(row => row !== null && row.revoked_at === null)
    const revoked = states.filter(row => row !== null && row.revoked_at !== null)
    expect(active).toHaveLength(1)
    expect(revoked).toHaveLength(1)
    await expect(sessionValkeyClient.get(getJwtRevokedKey(revoked[0]!.id))).resolves.toBe('1')
  })

  it('ignores already revoked and expired sessions', async () => {
    await setTestLimit(1)
    const user = await createTestUser()
    const revoked = await insertTestUserSession({ userId: user.id, revokedAt: new Date() })
    const expired = await insertTestUserSession({
      userId: user.id,
      expiresAt: new Date(Date.now() - 60_000),
    })
    const fresh = v7()
    await registerTestSession(user.id, fresh)

    expect((await getTestUserSessionById(revoked.id))?.revoked_at).not.toBeNull()
    expect((await getTestUserSessionById(expired.id))?.revoked_at).toBeNull()
    expect((await getTestUserSessionById(fresh))?.revoked_at).toBeNull()
    await expect(sessionValkeyClient.get(getJwtRevokedKey(expired.id))).resolves.toBeNull()
  })

  it('defers eviction keys until a caller transaction commits and omits them on rollback', async () => {
    await setTestLimit(1)
    const user = await createTestUser()
    const first = v7()
    await registerTestSession(user.id, first)

    {
      await using query = await beginTransaction()
      await registerTestSession(user.id, v7(), { query })
      expect((await getTestUserSessionById(first))?.revoked_at).toBeNull()
      await expect(sessionValkeyClient.get(getJwtRevokedKey(first))).resolves.toBeNull()
    }
    expect((await getTestUserSessionById(first))?.revoked_at).toBeNull()
    await expect(sessionValkeyClient.get(getJwtRevokedKey(first))).resolves.toBeNull()

    {
      await using query = await beginTransaction()
      await registerTestSession(user.id, v7(), { query })
      await query.commit()
    }
    expect((await getTestUserSessionById(first))?.revoked_at).not.toBeNull()
    await expect(sessionValkeyClient.get(getJwtRevokedKey(first))).resolves.toBe('1')
  })
})
