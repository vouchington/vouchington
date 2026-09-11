import { describe, expect, it } from 'vitest'
import {
  createTestUser,
  insertTestBlueskyFollowReceipt,
  insertTestBlueskyLinkedAccount,
} from '@voucha/test-helpers'
import { createUserDeletionRequest } from './create.mts'
import { addUserDeletionExternalWork, completeUserDeletionExternalWork } from './external-work.mts'
import { processUserDeletionBatch } from './lifecycle.mts'
import {
  addUserDeletionRelationImpactForTest,
  getUserDeletionCompletionAuditForTest,
  getUserDeletionRelationImpactIdsForTest,
  getUserDeletionRequestForTest,
} from './lifecycle.test-support.mts'
import { USER_DELETION_BATCH_SIZE } from './phases.mts'

describe('user deletion finalization', () => {
  it('removes a late Bluesky follow receipt and completes', async () => {
    const user = await createTestUser({ withEmail: false })
    const follower = await createTestUser()
    await insertTestBlueskyLinkedAccount({ userId: follower.id })
    await insertTestBlueskyFollowReceipt(follower.id, user.id)
    const request = await createUserDeletionRequest(user.id, user.id)
    let attemptId = request.processingAttemptId

    for (let phase = 0; phase < 7; phase++) {
      const successor = await processUserDeletionBatch(request.id, attemptId, {
        async processPhaseBatch() {
          return { hasMore: false }
        },
      })
      expect(successor).not.toBeNull()
      if (!successor) throw new Error('Expected successor')
      attemptId = successor.processingAttemptId
    }

    const receiptCleanup = await processUserDeletionBatch(request.id, attemptId, {
      async processPhaseBatch() {
        return { hasMore: false }
      },
    })
    expect(receiptCleanup).not.toBeNull()
    if (!receiptCleanup) throw new Error('Expected receipt-cleanup retry')

    await expect(
      processUserDeletionBatch(request.id, receiptCleanup.processingAttemptId, {
        async processPhaseBatch() {
          return { hasMore: false }
        },
      }),
    ).resolves.toBeNull()
    expect(await getUserDeletionRequestForTest(request.id)).toMatchObject({
      completedAt: expect.any(Date),
    })
  })

  it('bounds finalization audit cleanup and retries until it converges', async () => {
    const user = await createTestUser({ withEmail: false })
    const follower = await createTestUser()
    await insertTestBlueskyLinkedAccount({ userId: follower.id })
    await insertTestBlueskyFollowReceipt(follower.id, user.id)
    const request = await createUserDeletionRequest(user.id, user.id)
    const workKeys = Array.from(
      { length: USER_DELETION_BATCH_SIZE + 1 },
      (_, index) => `cache-tag:${user.id}:${index}`,
    )
    for (const workKey of workKeys) {
      await addUserDeletionExternalWork(request.id, 'cloudflare-cache-tag', workKey)
      await completeUserDeletionExternalWork(request.id, 'cloudflare-cache-tag', workKey)
      await addUserDeletionRelationImpactForTest(request.id, true)
    }

    let attemptId = request.processingAttemptId
    for (let phase = 0; phase < 7; phase++) {
      const successor = await processUserDeletionBatch(request.id, attemptId, {
        async processPhaseBatch() {
          return { hasMore: false }
        },
      })
      expect(successor).not.toBeNull()
      if (!successor) throw new Error('Expected successor')
      attemptId = successor.processingAttemptId
    }

    const receiptCleanup = await processUserDeletionBatch(request.id, attemptId, {
      async processPhaseBatch() {
        return { hasMore: false }
      },
    })
    expect(receiptCleanup).not.toBeNull()
    if (!receiptCleanup) throw new Error('Expected audit-cleanup retry')
    const beforeAuditCleanup = await getUserDeletionCompletionAuditForTest(request.id)
    expect(
      beforeAuditCleanup.externalWorks.filter(work => work.workKey.startsWith('redacted:')),
    ).toHaveLength(0)
    expect(await getUserDeletionRelationImpactIdsForTest(request.id)).toHaveLength(
      USER_DELETION_BATCH_SIZE + 1,
    )

    const boundedCleanup = await processUserDeletionBatch(
      request.id,
      receiptCleanup.processingAttemptId,
      {
        async processPhaseBatch() {
          return { hasMore: false }
        },
      },
    )
    expect(boundedCleanup).not.toBeNull()
    const cleanupAudit = await getUserDeletionCompletionAuditForTest(request.id)
    expect(cleanupAudit.externalWorks).toHaveLength(USER_DELETION_BATCH_SIZE + 1)
    expect(
      cleanupAudit.externalWorks.filter(work => work.workKey.startsWith('redacted:')),
    ).toHaveLength(USER_DELETION_BATCH_SIZE)
    expect(
      cleanupAudit.externalWorks.filter(work => !work.workKey.startsWith('redacted:')),
    ).toHaveLength(1)
    expect(await getUserDeletionRelationImpactIdsForTest(request.id)).toHaveLength(
      USER_DELETION_BATCH_SIZE + 1,
    )
    expect(await getUserDeletionRequestForTest(request.id)).toMatchObject({ completedAt: null })
    if (!boundedCleanup) throw new Error('Expected finalization retry')

    const finalRedaction = await processUserDeletionBatch(
      request.id,
      boundedCleanup.processingAttemptId,
      {
        async processPhaseBatch() {
          return { hasMore: false }
        },
      },
    )
    expect(finalRedaction).not.toBeNull()
    if (!finalRedaction) throw new Error('Expected relation-impact cleanup retry')
    expect(await getUserDeletionRelationImpactIdsForTest(request.id)).toHaveLength(
      USER_DELETION_BATCH_SIZE + 1,
    )

    const firstImpactCleanup = await processUserDeletionBatch(
      request.id,
      finalRedaction.processingAttemptId,
      {
        async processPhaseBatch() {
          return { hasMore: false }
        },
      },
    )
    expect(firstImpactCleanup).not.toBeNull()
    if (!firstImpactCleanup) throw new Error('Expected final relation-impact cleanup retry')
    expect(await getUserDeletionRelationImpactIdsForTest(request.id)).toHaveLength(1)

    const finalImpactCleanup = await processUserDeletionBatch(
      request.id,
      firstImpactCleanup.processingAttemptId,
      {
        async processPhaseBatch() {
          return { hasMore: false }
        },
      },
    )
    expect(finalImpactCleanup).not.toBeNull()
    if (!finalImpactCleanup) throw new Error('Expected completion retry')
    expect(await getUserDeletionRelationImpactIdsForTest(request.id)).toEqual([])

    await expect(
      processUserDeletionBatch(request.id, finalImpactCleanup.processingAttemptId, {
        async processPhaseBatch() {
          return { hasMore: false }
        },
      }),
    ).resolves.toBeNull()
    expect(await getUserDeletionRequestForTest(request.id)).toMatchObject({
      completedAt: expect.any(Date),
    })
    expect((await getUserDeletionCompletionAuditForTest(request.id)).externalWorks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ workKey: expect.stringMatching(/^redacted:/) }),
      ]),
    )
  })
})
