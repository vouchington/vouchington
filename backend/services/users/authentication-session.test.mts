import { withPostgresTransactionForTest } from '@voucha/test-helpers/postgres-transaction'
import { getTestEmailReAuthTokenState } from '@voucha/test-helpers/entities/login-tokens'
import { createDeviceAndSessionTokens } from '@services/jwt-session'
import { describe, expect, it } from 'vitest'
import { v7 } from 'uuid'
import { createTestUser, createRandomEmailAddress } from '@voucha/test-helpers'
import {
  deleteTestUserSession,
  invalidateTestUserSession,
} from '@voucha/test-helpers/entities/user-sessions'
import { setPrimaryEmailForUser } from '@voucha/test-helpers/entities/email-addresses'
import { createEmailAddressLoginToken, verifyEmailAddressLoginToken } from './authentication.mts'

async function actorScope(currentUserId: string) {
  const actor = await createDeviceAndSessionTokens({
    uid: currentUserId,
    did: v7(),
    deviceContext: {
      user_agent:
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/123.0.0.0 Safari/537.36',
    },
  })
  return {
    purpose: 're_auth' as const,
    currentUserId,
    session: { sid: actor.sessionToken.payload.sid, did: actor.deviceToken.payload.did },
  }
}

describe('email reauthentication actor scope', () => {
  it('keeps replacements local to each session and rejects cross-session consumption', async () => {
    const user = await createTestUser()
    const email = user.email_address!
    const actor = await actorScope(user.id)
    const other = await actorScope(user.id)
    const previous = await createEmailAddressLoginToken(email, actor)
    const [current, independent] = await Promise.all([
      createEmailAddressLoginToken(email, actor),
      createEmailAddressLoginToken(email, other),
    ])
    expect((await verifyEmailAddressLoginToken(email, previous.token, actor)).success).toBe(false)
    expect((await verifyEmailAddressLoginToken(email, current.token, other)).success).toBe(false)
    expect((await verifyEmailAddressLoginToken(email, current.token, actor)).success).toBe(true)
    expect((await verifyEmailAddressLoginToken(email, independent.token, other)).success).toBe(true)
    expect((await verifyEmailAddressLoginToken(email, current.token, actor)).success).toBe(false)
  })

  it('serializes simultaneous issuance within a session', async () => {
    const user = await createTestUser()
    const scope = await actorScope(user.id)
    const codes = await Promise.all([
      createEmailAddressLoginToken(user.email_address!, scope),
      createEmailAddressLoginToken(user.email_address!, scope),
    ])
    const results = await Promise.all(
      codes.map(({ token }) => verifyEmailAddressLoginToken(user.email_address!, token, scope)),
    )
    expect(results.filter(result => result.success)).toHaveLength(1)
  })

  it('rejects a mismatched device or user without consuming the legitimate actor’s code', async () => {
    const user = await createTestUser()
    const other = await createTestUser()
    const scope = await actorScope(user.id)
    const code = await createEmailAddressLoginToken(user.email_address!, scope)
    await expect(
      verifyEmailAddressLoginToken(user.email_address!, code.token, {
        ...scope,
        session: { ...scope.session, did: v7() },
      }),
    ).rejects.toMatchObject({ status: 401 })
    await expect(
      verifyEmailAddressLoginToken(user.email_address!, code.token, {
        ...scope,
        currentUserId: other.id,
      }),
    ).rejects.toMatchObject({ status: 401 })
    expect(
      (await verifyEmailAddressLoginToken(user.email_address!, code.token, scope)).success,
    ).toBe(true)
  })

  it('requires the same live actor and current primary at verification', async () => {
    const user = await createTestUser()
    const scope = await actorScope(user.id)
    const email = user.email_address!
    const code = await createEmailAddressLoginToken(email, scope)
    await setPrimaryEmailForUser(user.id, createRandomEmailAddress())
    await expect(verifyEmailAddressLoginToken(email, code.token, scope)).rejects.toMatchObject({
      status: 403,
    })
    await deleteTestUserSession(scope.session.sid)
    await expect(verifyEmailAddressLoginToken(email, code.token, scope)).rejects.toMatchObject({
      status: 401,
    })
  })
  it.each(['revoked', 'expired'] as const)(
    'rejects a %s actor without consuming its code',
    async reason => {
      const user = await createTestUser()
      const scope = await actorScope(user.id)
      const code = await createEmailAddressLoginToken(user.email_address!, scope)
      await invalidateTestUserSession(scope.session.sid, reason)
      await expect(
        verifyEmailAddressLoginToken(user.email_address!, code.token, scope),
      ).rejects.toMatchObject({ status: 401 })
      expect(await getTestEmailReAuthTokenState(scope.session.sid, code.token)).toEqual({
        invalidated: false,
        consumed: false,
      })
    },
  )

  it('rolls code consumption back with the caller-owned transaction', async () => {
    const user = await createTestUser()
    const scope = await actorScope(user.id)
    const code = await createEmailAddressLoginToken(user.email_address!, scope)
    await withPostgresTransactionForTest(async query => {
      const result = await verifyEmailAddressLoginToken(user.email_address!, code.token, scope, {
        query,
      })
      expect(result.success).toBe(true)
    })
    expect(
      (await verifyEmailAddressLoginToken(user.email_address!, code.token, scope)).success,
    ).toBe(true)
  })
})
