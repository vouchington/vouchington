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
  it('commits terminal status and secret cleanup before returning the expiry error', async () => {
    const state = randomUUID()
    const authorizationId = await insertTestOAuthAuthorization({
      state,
      callbackCodeCiphertext: 'expired-callback-ciphertext',
      completionTokenCiphertext: 'expired-completion-ciphertext',
      expiresAt: new Date(Date.now() - 1_000),
    })
    onTestFinished(async () => {
      await deleteTestOAuthAuthorizationFixtures({ authorizationIds: [authorizationId] })
    })

    await expect(
      receiveOAuthAuthorizationCallback({
        provider: 'github',
        state,
        code: 'provider-code',
      }),
    ).rejects.toMatchObject({ status: 410 })
    expect(await getTestOAuthAuthorization(authorizationId)).toMatchObject({
      status: 'expired',
      callback_code_ciphertext: null,
      completion_token_ciphertext: null,
    })
  })

  it('returns expiry without changing an already completed authorization', async () => {
    const state = randomUUID()
    const providerUserId = `completed-callback-${randomUUID()}`
    const user = await createTestUser()
    await insertTestOAuthAccount('github', providerUserId)
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
      receiveOAuthAuthorizationCallback({
        provider: 'github',
        state,
        code: 'provider-code',
      }),
    ).rejects.toMatchObject({ status: 410 })
    expect(await getTestOAuthAuthorization(authorizationId)).toMatchObject({
      status: 'completed',
      github_user_id: providerUserId,
      result_kind: 'authenticated',
      result_user_id: user.id,
    })
  })
})
