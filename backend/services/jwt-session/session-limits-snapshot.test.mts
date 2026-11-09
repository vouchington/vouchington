import { describe, expect, it, onTestFinished } from 'vitest'
import { v7 } from 'uuid'
import { sessionValkeyClient } from '@data-stores/valkey/clients'
import { upsertUserAgentString } from '@data-stores/psql/upsert-user-agent-string'
import {
  beginTransaction,
  createTestUserDirect,
  getTestUserSessionById,
  overrideDynamicConfigFieldsForTest,
} from '@voucha/test-helpers'
import {
  seedJwtAdmissionOverflow,
  readJwtAdmissionSessionStates,
} from '@voucha/test-helpers/session-admission-overflow'
import { getJwtRevokedKey } from './constants.mts'
import { sessionLimitsConfig, sessionLimitsMaxValues } from './session-limits-config.mts'
import { registerAuthenticatedSession } from './user-sessions.mts'

function registerTestSession(
  userId: string,
  sid: string,
  options: { query?: Awaited<ReturnType<typeof beginTransaction>> } = {},
) {
  return registerAuthenticatedSession(
    { uid: userId, sid, did: v7(), expiresAt: new Date(Date.now() + 60_000) },
    options.query ? { query: options.query } : undefined,
  )
}

describe('best effort session admission snapshots', () => {
  it('accepts concurrent snapshot overshoot and evicts it on the next admission', async () => {
    await sessionLimitsConfig.waitForInitialization()
    onTestFinished(
      overrideDynamicConfigFieldsForTest(sessionLimitsConfig, { active_sessions_per_user: 1 }),
    )
    const user = await createTestUserDirect()
    await upsertUserAgentString('')
    const first = v7()
    const second = v7()
    await using firstQuery = await beginTransaction()
    await using secondQuery = await beginTransaction()
    // Each transaction sees its own insertion before either session becomes visible to the other.
    await registerTestSession(user.id, first, { query: firstQuery })
    await registerTestSession(user.id, second, { query: secondQuery })
    await Promise.all([firstQuery.commit(), secondQuery.commit()])
    const states = await Promise.all([
      getTestUserSessionById(first),
      getTestUserSessionById(second),
    ])
    expect(states.map(row => row?.revoked_at)).toEqual([null, null])

    const third = v7()
    await registerTestSession(user.id, third)
    for (const sid of [first, second]) {
      expect((await getTestUserSessionById(sid))?.revoked_at).not.toBeNull()
      await expect(sessionValkeyClient.get(getJwtRevokedKey(sid))).resolves.toBe('1')
    }
    expect((await getTestUserSessionById(third))?.revoked_at).toBeNull()
  })

  it('drains bounded overflow above the hard maximum instead of rejecting the next admission', async () => {
    const maximum = sessionLimitsMaxValues.active_sessions_per_user
    await sessionLimitsConfig.waitForInitialization()
    onTestFinished(
      overrideDynamicConfigFieldsForTest(sessionLimitsConfig, {
        active_sessions_per_user: maximum,
      }),
    )
    const user = await createTestUserDirect()
    const oldIds = await seedJwtAdmissionOverflow(user.id, maximum + 1)
    const sid = v7()
    await expect(registerTestSession(user.id, sid)).resolves.toBeUndefined()
    const states = await readJwtAdmissionSessionStates([...oldIds, sid])
    expect(states).toHaveLength(maximum + 2)
    expect(states.filter(row => row.revoked_at === null)).toHaveLength(maximum)
    expect(states.filter(row => row.revoked_at !== null)).toHaveLength(2)
    expect((await getTestUserSessionById(sid))?.revoked_at).toBeNull()
  })
})
