import { randomUUID } from 'node:crypto'
import { describe, expect, it, onTestFinished } from 'vitest'
import {
  deleteTestOAuthAuthorizationFixtures,
  getTestOAuthAuthorization,
  insertTestOAuthAuthorization,
} from '@voucha/test-helpers/entities/oauth-authorizations'
import { createTestUser, insertTestOAuthAccount } from '@voucha/test-helpers'
import { receiveOAuthAuthorizationCallback } from '../authorization-callback.mts'

describe('OAuth authorization callback expiry', () => {
  it('rejects an invalid internal decision clock without changing the owned flow', async () => {
    const state = randomUUID()
    const authorizationId = await insertTestOAuthAuthorization({ state })
    onTestFinished(async () => {
      await deleteTestOAuthAuthorizationFixtures({ authorizationIds: [authorizationId] })
    })

    await expect(
      receiveOAuthAuthorizationCallback(
        { provider: 'github', state, code: 'provider-code' },
        () => new Date(Number.NaN),
      ),
    ).rejects.toThrow(RangeError)
    expect(await getTestOAuthAuthorization(authorizationId)).toMatchObject({ status: 'pending' })
  })

  it.each([
    '2028-02-29T23:59:59.999Z',
    '2028-03-01T00:00:00.000Z',
    '2029-12-31T23:59:59.999Z',
    '2030-01-01T00:00:00.000Z',
  ])('uses the supplied decision instant at %s', async instant => {
    const decisionAt = new Date(instant)
    const authorizationIds: string[] = []
    onTestFinished(async () => {
      await deleteTestOAuthAuthorizationFixtures({ authorizationIds })
    })

    for (const [offsetMs, expired] of [
      [-1, true],
      [0, true],
      [1, false],
    ] as const) {
      const state = randomUUID()
      const authorizationId = await insertTestOAuthAuthorization({
        state,
        expiresAt: new Date(decisionAt.getTime() + offsetMs),
        callbackCodeCiphertext: 'boundary-callback-ciphertext',
      })
      authorizationIds.push(authorizationId)
      const outcome = await receiveOAuthAuthorizationCallback(
        { provider: 'github', state, code: 'provider-code' },
        () => decisionAt,
      ).then(
        value => ({ kind: 'accepted', value }),
        (err: unknown) => ({ kind: 'rejected', value: err }),
      )
      const expectedOutcome = expired
        ? { kind: 'rejected', value: { status: 410 } }
        : { kind: 'accepted', value: { flowId: authorizationId, exchangeRequired: true } }
      expect(outcome).toMatchObject(expectedOutcome)
      const encryptedCode = expect.any(String)
      expect(await getTestOAuthAuthorization(authorizationId)).toMatchObject({
        status: expired ? 'expired' : 'callback_received',
        callback_code_ciphertext: expired ? null : encryptedCode,
      })
    }
  })

  it.each(['github', 'google'] as const)(
    'commits terminal status and secret cleanup before returning the expired %s callback error',
    async provider => {
      const state = randomUUID()
      const authorizationId = await insertTestOAuthAuthorization({
        provider,
        state,
        callbackCodeCiphertext: 'expired-callback-ciphertext',
        completionTokenCiphertext: 'expired-completion-ciphertext',
        expiresAt: new Date(Date.now() - 1_000),
      })
      onTestFinished(async () => {
        await deleteTestOAuthAuthorizationFixtures({ authorizationIds: [authorizationId] })
      })

      await expect(
        receiveOAuthAuthorizationCallback(
          {
            provider,
            state,
            code: 'provider-code',
          },
          () => new Date(),
        ),
      ).rejects.toMatchObject({ status: 410 })
      expect(await getTestOAuthAuthorization(authorizationId)).toMatchObject({
        status: 'expired',
        callback_code_ciphertext: null,
        completion_token_ciphertext: null,
      })
    },
  )

  it('returns expiry without changing an already completed authorization', async () => {
    const state = randomUUID()
    const providerUserId = `completed-callback-${randomUUID()}`
    const user = await createTestUser()
    const account = await insertTestOAuthAccount('github', providerUserId)
    const authorizationId = await insertTestOAuthAuthorization({
      state,
      status: 'completed',
      callbackReceivedAt: new Date(Date.now() - 3_000),
      completionReadyAt: new Date(Date.now() - 2_000),
      completedAt: new Date(Date.now() - 1_000),
      providerUserId,
      resultKind: 'authenticated',
      resultUserId: user.id,
      expiresAt: new Date(Date.now() - 500),
    })
    onTestFinished(async () => {
      await deleteTestOAuthAuthorizationFixtures({
        authorizationIds: [authorizationId],
        githubUserIds: [providerUserId],
        userIds: [user.id],
      })
    })

    await expect(
      receiveOAuthAuthorizationCallback(
        {
          provider: 'github',
          state,
          code: 'provider-code',
        },
        () => new Date(),
      ),
    ).rejects.toMatchObject({ status: 410 })
    expect(await getTestOAuthAuthorization(authorizationId)).toMatchObject({
      status: 'completed',
      github_account_id: account.account_id,
      result_kind: 'authenticated',
      result_user_id: user.id,
    })
  })
})
