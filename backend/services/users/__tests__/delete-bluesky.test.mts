import { describe, expect, it } from 'vitest'
import {
  createTestExpiryWindow,
  createTestUser,
  softDeleteUser,
  suspendTestUser,
} from '@voucha/test-helpers'
import {
  countTestBlueskyFollowReceiptsForUser,
  getTestBlueskyCompletionProofVerifier,
  getTestBlueskyLinkAuthorizationRow,
  acquireTestUserAdvisoryLock,
  getTestBlueskyLinkedAccountRow,
  insertTestBlueskyFollowReceipt,
  insertTestBlueskyLinkedAccount,
  insertTestBlueskyLinkCompletion,
  testBlueskyLinkCompletionExists,
  setTestBlueskyLinkCompletionExpiresAt,
} from '@voucha/test-helpers/entities/bluesky-linked-accounts'
import {
  createNativeBlueskyLinkCompletion,
  finalizeNativeBlueskyAccountLink,
} from '@services/bluesky-accounts'
import { v7 } from 'uuid'
import { deleteUser } from '../delete.mts'
import { deleteUserAndDrainForTest, drainUserDeletionForTest } from '../delete-test-support.mts'
import { getPrivateUserByAny } from '../get.mts'
import { cleanupExpiredBlueskyLinkCompletions } from '../../data-retention/cleanup.mts'

describe('deleteUser Bluesky cleanup', () => {
  it('preserves another user attached to a DID referenced by a stale completion', async () => {
    const deletingUser = await createTestUser()
    const linkedUser = await createTestUser()
    const linked = await insertTestBlueskyLinkedAccount({ userId: linkedUser.id })
    const staleFlowId = linked.link_authorization_id
    await insertTestBlueskyLinkCompletion({
      flowId: staleFlowId,
      userId: deletingUser.id,
      did: linked.bluesky_did,
      claimOwnership: false,
    })

    await deleteUserAndDrainForTest(deletingUser, deletingUser)

    expect(await getTestBlueskyLinkedAccountRow(linked.bluesky_did)).toMatchObject({
      user_id: linkedUser.id,
      link_authorization_id: linked.link_authorization_id,
    })
    expect(await testBlueskyLinkCompletionExists(staleFlowId)).toBe(false)
  })

  it('allows only one native flow to own a shared DID', async () => {
    const firstUser = await createTestUser()
    const secondUser = await createTestUser()
    const flowIds = [v7(), v7()] as const
    const pending = await insertTestBlueskyLinkedAccount({
      userId: null,
      handle: null,
      linkingUserId: firstUser.id,
      authorizationId: flowIds[0],
      nativeFlowId: flowIds[0],
    })

    const results = await Promise.allSettled(
      [firstUser, secondUser].map((user, index) =>
        createNativeBlueskyLinkCompletion({
          flowId: flowIds[index]!,
          userId: user.id,
          did: pending.bluesky_did,
          handle: `${v7()}.bsky.social`,
        }),
      ),
    )

    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    const rejection = results.find(result => result.status === 'rejected')
    expect(rejection).toMatchObject({ status: 'rejected', reason: { status: 409 } })
    const winningIndex = results.findIndex(result => result.status === 'fulfilled')
    expect(winningIndex).toBe(0)
    expect(await getTestBlueskyLinkedAccountRow(pending.bluesky_did)).toMatchObject({
      user_id: null,
      link_authorization_id: flowIds[winningIndex],
    })
    expect(await testBlueskyLinkCompletionExists(flowIds[winningIndex]!)).toBe(true)
    expect(await testBlueskyLinkCompletionExists(flowIds[1 - winningIndex]!)).toBe(false)
  })

  it('cleans the provider session when completion creation finds a deleted user', async () => {
    const user = await createTestUser()
    const flowId = v7()
    const pending = await insertTestBlueskyLinkedAccount({
      userId: null,
      handle: null,
      linkingUserId: user.id,
      authorizationId: flowId,
      nativeFlowId: flowId,
    })
    await softDeleteUser(user.id)

    await expect(
      createNativeBlueskyLinkCompletion({
        flowId,
        userId: user.id,
        did: pending.bluesky_did,
        handle: `${v7()}.bsky.social`,
      }),
    ).rejects.toMatchObject({ status: 404 })
    expect(await getTestBlueskyLinkedAccountRow(pending.bluesky_did)).toBeNull()
    expect(await testBlueskyLinkCompletionExists(flowId)).toBe(false)
    expect(await getTestBlueskyLinkAuthorizationRow(flowId)).toMatchObject({
      status: 'rejected',
      handle: null,
    })
  })

  it('cleans the provider session when completion creation finds a suspended user', async () => {
    const user = await createTestUser()
    const flowId = v7()
    const pending = await insertTestBlueskyLinkedAccount({
      userId: null,
      handle: null,
      linkingUserId: user.id,
      authorizationId: flowId,
      nativeFlowId: flowId,
    })
    await suspendTestUser(user.id)

    await expect(
      createNativeBlueskyLinkCompletion({
        flowId,
        userId: user.id,
        did: pending.bluesky_did,
        handle: `${v7()}.bsky.social`,
      }),
    ).rejects.toMatchObject({ status: 403, code: 'ACCOUNT_SUSPENDED' })
    expect(await getTestBlueskyLinkedAccountRow(pending.bluesky_did)).toBeNull()
    expect(await testBlueskyLinkCompletionExists(flowId)).toBe(false)
  })

  it('serializes deletion against native completion creation', async () => {
    const user = await createTestUser()
    const flowId = v7()
    const pending = await insertTestBlueskyLinkedAccount({
      userId: null,
      handle: null,
      linkingUserId: user.id,
      authorizationId: flowId,
      nativeFlowId: flowId,
    })

    const [deletion, creation] = await Promise.allSettled([
      deleteUser(user, user),
      createNativeBlueskyLinkCompletion({
        flowId,
        userId: user.id,
        did: pending.bluesky_did,
        handle: `${v7()}.bsky.social`,
      }),
    ])

    expect(deletion.status).toBe('fulfilled')
    if (deletion.status === 'fulfilled') await drainUserDeletionForTest(deletion.value)
    const creationStatus = creation.status === 'fulfilled' ? 201 : creation.reason?.status
    expect([201, 404]).toContain(creationStatus)
    expect(await getPrivateUserByAny(user.id)).toBeNull()
    expect(await getTestBlueskyLinkedAccountRow(pending.bluesky_did)).toBeNull()
    expect(await testBlueskyLinkCompletionExists(flowId)).toBe(false)
  })

  it('removes linked and pending encrypted sessions plus local follow receipts', async () => {
    const user = await createTestUser()
    const follower = await createTestUser()
    const followee = await createTestUser()
    const linked = await insertTestBlueskyLinkedAccount({ userId: user.id })
    const flowId = v7()
    const pending = await insertTestBlueskyLinkedAccount({
      userId: null,
      linkingUserId: user.id,
      authorizationId: flowId,
      nativeFlowId: flowId,
    })
    await createNativeBlueskyLinkCompletion({
      flowId,
      userId: user.id,
      did: pending.bluesky_did,
      handle: `${v7()}.bsky.social`,
    })
    await insertTestBlueskyFollowReceipt(user.id, followee.id)
    await insertTestBlueskyFollowReceipt(follower.id, user.id)

    await deleteUserAndDrainForTest(user, user)

    expect(await getPrivateUserByAny(user.id)).toBeNull()
    expect(await getTestBlueskyLinkedAccountRow(linked.bluesky_did)).toBeNull()
    expect(await getTestBlueskyLinkedAccountRow(pending.bluesky_did)).toBeNull()
    expect(await testBlueskyLinkCompletionExists(flowId)).toBe(false)
    expect(await countTestBlueskyFollowReceiptsForUser(user.id)).toBe(0)
  })

  it('serializes deletion against native completion consumption', async () => {
    const user = await createTestUser()
    const flowId = v7()
    const pending = await insertTestBlueskyLinkedAccount({
      userId: null,
      linkingUserId: user.id,
      authorizationId: flowId,
      nativeFlowId: flowId,
    })
    const token = await createNativeBlueskyLinkCompletion({
      flowId,
      userId: user.id,
      did: pending.bluesky_did,
      handle: `${v7()}.bsky.social`,
    })

    const [deletion, completion] = await Promise.allSettled([
      deleteUser(user, user),
      finalizeNativeBlueskyAccountLink(
        user.id,
        flowId,
        token,
        getTestBlueskyCompletionProofVerifier(flowId),
      ),
    ])

    expect(deletion.status).toBe('fulfilled')
    if (deletion.status === 'fulfilled') await drainUserDeletionForTest(deletion.value)
    const completionStatus = completion.status === 'fulfilled' ? 204 : completion.reason?.status
    expect([204, 404]).toContain(completionStatus)
    expect(await getPrivateUserByAny(user.id)).toBeNull()
    expect(await getTestBlueskyLinkedAccountRow(pending.bluesky_did)).toBeNull()
    expect(await testBlueskyLinkCompletionExists(flowId)).toBe(false)
  })

  it('serializes expired completion cleanup and user deletion on the same first lock', async () => {
    const user = await createTestUser()
    const window = createTestExpiryWindow()
    const flowId = v7()
    const pending = await insertTestBlueskyLinkedAccount({
      userId: null,
      linkingUserId: user.id,
      authorizationId: flowId,
      nativeFlowId: flowId,
    })
    await insertTestBlueskyLinkCompletion({
      flowId,
      userId: user.id,
      did: pending.bluesky_did,
    })
    await setTestBlueskyLinkCompletionExpiresAt(flowId, window.firstEligibleDate)
    const heldLock = await acquireTestUserAdvisoryLock(user.id)
    const cleanup = cleanupExpiredBlueskyLinkCompletions({
      batchSize: 1,
      lowerBoundDate: window.lowerBoundDate,
      now: window.now,
    })
    const deletion = deleteUser(user, user)

    heldLock.release()
    const [, , attempt] = await Promise.all([heldLock.completed, cleanup, deletion])
    await drainUserDeletionForTest(attempt)

    expect(await getPrivateUserByAny(user.id)).toBeNull()
    expect(await getTestBlueskyLinkedAccountRow(pending.bluesky_did)).toBeNull()
    expect(await testBlueskyLinkCompletionExists(flowId)).toBe(false)
  })
})
