import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { completeOAuthAuthorization } from '../authorization-completion.mts'
import { completeOAuthAuthorizationTransaction } from '../authorization-completion-transaction.mts'
import { findYourFriendsQueue } from '@queues/find-your-friends/queues'
import {
  createTestUser,
  createTestUserDirect,
  getActiveTestUserSessions,
  getTestUserRaw,
  setTestUserVoteWeightRecalculatedAt,
} from '@voucha/test-helpers'
import { getTestOAuthAuthorization } from '@voucha/test-helpers/entities/oauth-authorizations'
import {
  createOAuthAccount,
  insertCompletionReadyAuthorization,
  registerCleanup,
} from '../test-helpers/authorization-completion.mts'

describe('OAuth authorization completion', () => {
  it('persists an authentication result and safely replays a lost response', async () => {
    const cleanup = registerCleanup()
    const deviceId = randomUUID()
    const sessionId = randomUUID()
    const completionToken = randomBytes(32).toString('base64url')
    const account = await createOAuthAccount('github', cleanup)
    const flowId = await insertCompletionReadyAuthorization(
      {
        accountId: account.provider_user_id,
        provider: 'github',
        deviceId,
        sessionId,
        completionToken,
        purpose: 'authenticate',
        callbackMode: 'web',
      },
      cleanup,
    )

    await expect(
      completeOAuthAuthorization({
        flowId,
        completionToken,
        completionTokenSource: 'body',
        deviceId,
        sessionId,
      }),
    ).rejects.toMatchObject({ status: 401 })

    const durableResult = await completeOAuthAuthorizationTransaction({
      flowId,
      completionToken,
      completionTokenSource: 'cookie',
      deviceId,
      sessionId,
    })
    expect(durableResult).toMatchObject({ kind: 'authenticated' })
    if (durableResult.kind !== 'authenticated') throw new Error('Expected authentication')
    cleanup.userIds.push(durableResult.userId)
    expect(await getActiveTestUserSessions(durableResult.userId)).toEqual([])

    const first = await completeOAuthAuthorization({
      flowId,
      completionToken,
      completionTokenSource: 'cookie',
      deviceId,
      sessionId,
    })
    expect(first.status).toBe('authenticated')
    if (first.status !== 'authenticated') throw new Error('Expected authenticated result')
    expect(first.user.id).toBe(durableResult.userId)
    expect(first.deviceToken.payload.did).toBe(durableResult.deviceId)
    expect(first.sessionToken.payload.sid).toBe(durableResult.sessionId)

    const replay = await completeOAuthAuthorization({
      flowId,
      completionToken,
      completionTokenSource: 'cookie',
      deviceId: first.deviceToken.payload.did,
      sessionId: first.sessionToken.payload.sid,
      currentUserId: first.user.id,
    })
    expect(replay).toMatchObject({ status: 'authenticated', user: { id: first.user.id } })
    expect(replay).toMatchObject({
      status: 'authenticated',
      deviceToken: { payload: { did: first.deviceToken.payload.did } },
      sessionToken: { payload: { sid: first.sessionToken.payload.sid } },
    })
    expect(await getActiveTestUserSessions(first.user.id)).toMatchObject([
      { id: first.sessionToken.payload.sid },
    ])

    const row = await getTestOAuthAuthorization(flowId)
    expect(row).toMatchObject({
      status: 'completed',
      result_kind: 'authenticated',
      result_user_id: first.user.id,
      result_device_id: first.deviceToken.payload.did,
      result_session_id: first.sessionToken.payload.sid,
      completion_token_ciphertext: null,
    })
  })

  it('requires the app-held proof and links the exact initiating user', async () => {
    const cleanup = registerCleanup()
    const user = await createTestUser()
    const userId = user.id
    cleanup.userIds.push(userId)
    const deviceId = randomUUID()
    const sessionId = randomUUID()
    const completionToken = randomBytes(32).toString('base64url')
    const proofVerifier = randomBytes(32).toString('base64url')
    const account = await createOAuthAccount('facebook', cleanup)
    const flowId = await insertCompletionReadyAuthorization(
      {
        accountId: account.provider_user_id,
        provider: 'facebook',
        deviceId,
        sessionId,
        completionToken,
        purpose: 'connect',
        callbackMode: 'native',
        initiatingUserId: userId,
        proofChallenge: createHash('sha256').update(proofVerifier).digest('base64url'),
      },
      cleanup,
    )

    await expect(
      completeOAuthAuthorization({
        flowId,
        completionToken,
        completionTokenSource: 'body',
        completionProofVerifier: randomBytes(32).toString('base64url'),
        currentUserId: userId,
        deviceId,
        sessionId,
      }),
    ).rejects.toMatchObject({ status: 401 })

    await expect(
      completeOAuthAuthorization({
        flowId,
        completionToken,
        completionTokenSource: 'body',
        completionProofVerifier: proofVerifier,
        currentUserId: randomUUID(),
        deviceId,
        sessionId,
      }),
    ).rejects.toMatchObject({ status: 403 })

    await expect(
      completeOAuthAuthorization({
        flowId,
        completionToken,
        completionTokenSource: 'body',
        completionProofVerifier: proofVerifier,
        currentUserId: userId,
        deviceId,
        sessionId,
      }),
    ).resolves.toMatchObject({
      status: 'connected',
      account: { provider_user_id: account.provider_user_id },
    })
    await expect(
      completeOAuthAuthorization({
        flowId,
        completionToken,
        completionTokenSource: 'body',
        completionProofVerifier: proofVerifier,
        currentUserId: userId,
        deviceId,
        sessionId,
      }),
    ).resolves.toMatchObject({ status: 'connected' })

    await vi.waitFor(async () => {
      const jobs = (
        await Promise.all(
          (['waiting', 'active', 'completed', 'failed', 'delayed'] as const).map(state =>
            findYourFriendsQueue.getJobs(state),
          ),
        )
      )
        .flat()
        .filter(
          job =>
            job.name === 'syncFacebookFriends' &&
            (job.data as { facebookUserId?: string }).facebookUserId === account.provider_user_id,
        )
      expect(jobs).toHaveLength(1)
    })
  })

  it('leaves a durable vote-weight recovery marker when completion commits before effects run', async () => {
    const cleanup = registerCleanup()
    const connectedUser = await createTestUserDirect()
    cleanup.userIds.push(connectedUser.id)
    await setTestUserVoteWeightRecalculatedAt(connectedUser.id, new Date())
    expect((await getTestUserRaw(connectedUser.id))?.vote_weight_recalculated_at).toBeInstanceOf(
      Date,
    )

    const deviceId = randomUUID()
    const sessionId = randomUUID()
    const completionToken = randomBytes(32).toString('base64url')
    const account = await createOAuthAccount('github', cleanup)
    const flowId = await insertCompletionReadyAuthorization(
      {
        accountId: account.provider_user_id,
        provider: 'github',
        deviceId,
        sessionId,
        completionToken,
        purpose: 'connect',
        callbackMode: 'web',
        initiatingUserId: connectedUser.id,
      },
      cleanup,
    )

    await expect(
      completeOAuthAuthorizationTransaction({
        flowId,
        completionToken,
        completionTokenSource: 'cookie',
        currentUserId: connectedUser.id,
        deviceId,
        sessionId,
      }),
    ).resolves.toMatchObject({
      kind: 'connected',
      userId: connectedUser.id,
      newlyCompleted: true,
    })

    expect((await getTestUserRaw(connectedUser.id))?.vote_weight_recalculated_at).toBeNull()
  })
})
