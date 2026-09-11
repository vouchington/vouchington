import { randomUUID } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import type { deleteExportFromS3 } from '@services/account-data-requests'
import {
  addUserDeletionExternalWork,
  claimUserDeletionAttempt,
  createUserDeletionRequest,
  processUserDeletionBatch,
} from '@services/user-deletions'
import {
  countTestPostsCreatedBy,
  countTestPostSourcesForContributor,
  countTestUserDeletionActiveLists,
  countTestUserDeletionFollowPostRelations,
  countTestUserDeletionPostVotes,
  createRandomString,
  createTestPost,
  createTopHashtagAliasForTest,
  createTestTopic,
  createTestUser,
  insertTestPostSourcesForContributor,
  insertTestPostsForUser,
  insertTestUserDeletionFollowPostRelations,
  insertTestUserDeletionLists,
  insertTestUserDeletionPostVotes,
  isTestUserDeletionExternalWorkCompleted,
  rotateTestUserDeletionAttemptDuringProviderCall,
} from '@voucha/test-helpers'
import { deleteUser } from './delete.mts'
import { processUserDeletionExternalWork, processUserDeletionPhaseBatch } from './delete-phases.mts'
import { drainUserDeletionForTest } from './delete-test-support.mts'

describe('user deletion batches', () => {
  it('drains 201 authored posts in three committed batches of at most 100', async () => {
    const user = await createTestUser()
    await insertTestPostsForUser(user.id, 201)
    let attempt = await deleteUser(user, user)

    for (let batch = 0; batch < 3; batch++) {
      const next = await processUserDeletionBatch(attempt.requestId, attempt.processingAttemptId, {
        processPhaseBatch: processUserDeletionPhaseBatch,
      })
      expect(next).not.toBeNull()
      if (!next) throw new Error('Expected a successor deletion attempt')
      attempt = next
    }

    expect(await countTestPostsCreatedBy(user.id)).toBe(0)
    await drainUserDeletionForTest(attempt)
  })

  it('does not advance a stale processing attempt', async () => {
    const user = await createTestUser()
    await insertTestPostsForUser(user.id, 1)
    const initial = await deleteUser(user, user)
    const successor = await processUserDeletionBatch(
      initial.requestId,
      initial.processingAttemptId,
      { processPhaseBatch: processUserDeletionPhaseBatch },
    )
    expect(successor).not.toBeNull()
    if (!successor) throw new Error('Expected successor')

    await expect(
      processUserDeletionBatch(initial.requestId, initial.processingAttemptId, {
        processPhaseBatch: processUserDeletionPhaseBatch,
      }),
    ).resolves.toBeNull()
    await drainUserDeletionForTest(successor)
  })

  it('drains 201 contributed sources in three committed batches of at most 100', async () => {
    const [owner, contributor] = await Promise.all([createTestUser(), createTestUser()])
    const postIds = await insertTestPostsForUser(owner.id, 201)
    const topic = await createTestTopic()
    const topicAliasId = await createTopHashtagAliasForTest(
      topic.id,
      `deletion-batch-${createRandomString(8).toLowerCase()}`,
    )
    await insertTestPostSourcesForContributor(postIds, topicAliasId, contributor.id)
    let attempt = await deleteUser(contributor, contributor)

    for (let batch = 0; batch < 3; batch++) {
      const next = await processUserDeletionBatch(attempt.requestId, attempt.processingAttemptId, {
        processPhaseBatch: processUserDeletionPhaseBatch,
      })
      expect(next).not.toBeNull()
      if (!next) throw new Error('Expected a successor deletion attempt')
      attempt = next
    }

    expect(await countTestPostSourcesForContributor(contributor.id)).toBe(0)
    await drainUserDeletionForTest(attempt)
  })

  it('drains 201 vote-history rows across partition keys in three committed batches of at most 100', async () => {
    const [author, voter] = await Promise.all([createTestUser(), createTestUser()])
    const [firstPost, secondPost] = await Promise.all([
      createTestPost({ user: author }),
      createTestPost({ user: author }),
    ])
    await Promise.all([
      insertTestUserDeletionPostVotes(voter.id, firstPost.id, 101),
      insertTestUserDeletionPostVotes(voter.id, secondPost.id, 100),
    ])
    const attempt = await deleteUser(voter, voter)

    for (const expectedRemaining of [101, 1, 0]) {
      await processUserDeletionPhaseBatch({
        requestId: attempt.requestId,
        userId: voter.id,
        processingAttemptId: attempt.processingAttemptId,
        phase: 'votes',
        batchSize: 100,
      })
      await expect(countTestUserDeletionPostVotes(voter.id)).resolves.toBe(expectedRemaining)
    }
    await drainUserDeletionForTest(attempt)
  })

  it('drains 201 active lists in three committed batches of at most 100', async () => {
    const user = await createTestUser()
    await insertTestUserDeletionLists(user.id, 201)
    const attempt = await deleteUser(user, user)

    for (const expectedRemaining of [101, 1, 0]) {
      await processUserDeletionPhaseBatch({
        requestId: attempt.requestId,
        userId: user.id,
        processingAttemptId: attempt.processingAttemptId,
        phase: 'user-relations',
        batchSize: 100,
      })
      await expect(countTestUserDeletionActiveLists(user.id)).resolves.toBe(expectedRemaining)
    }
    await drainUserDeletionForTest(attempt)
  })

  it('drains 201 user-subject relations in three committed batches of at most 100', async () => {
    const [owner, follower] = await Promise.all([createTestUser(), createTestUser()])
    const postIds = await insertTestPostsForUser(owner.id, 201)
    await insertTestUserDeletionFollowPostRelations(follower.id, postIds)
    const attempt = await deleteUser(follower, follower)

    for (const expectedRemaining of [101, 1, 0]) {
      await processUserDeletionPhaseBatch({
        requestId: attempt.requestId,
        userId: follower.id,
        processingAttemptId: attempt.processingAttemptId,
        phase: 'user-relations',
        batchSize: 100,
      })
      await expect(countTestUserDeletionFollowPostRelations(follower.id)).resolves.toBe(
        expectedRemaining,
      )
    }
    await drainUserDeletionForTest(attempt)
  })

  it('keeps required provider work pending until the provider succeeds', async () => {
    const user = await createTestUser()
    const request = await createUserDeletionRequest(user.id, user.id)
    await addUserDeletionExternalWork(request.id, 's3-export', 'test/export.zip')
    await claimUserDeletionAttempt(request.id, request.processingAttemptId)
    const deleteS3 = vi
      .fn<typeof deleteExportFromS3>()
      .mockRejectedValueOnce(new Error('S3 unavailable'))
      .mockResolvedValue(undefined)

    await expect(
      processUserDeletionExternalWork(request.id, request.processingAttemptId, {
        deleteExportFromS3: deleteS3,
      }),
    ).rejects.toThrow('S3 unavailable')
    await expect(
      processUserDeletionExternalWork(request.id, request.processingAttemptId, {
        deleteExportFromS3: deleteS3,
      }),
    ).resolves.toEqual({ hasMore: true })
    await expect(
      processUserDeletionExternalWork(request.id, request.processingAttemptId, {
        deleteExportFromS3: deleteS3,
      }),
    ).resolves.toEqual({ hasMore: false })
    expect(deleteS3).toHaveBeenCalledTimes(2)
  })

  it('completes Stripe work when the customer is already missing', async () => {
    const user = await createTestUser()
    const request = await createUserDeletionRequest(user.id, user.id)
    await addUserDeletionExternalWork(request.id, 'stripe-customer', 'cus_already_deleted')
    await claimUserDeletionAttempt(request.id, request.processingAttemptId)
    const sanitizeCustomer = vi
      .fn<(stripeCustomerId: string) => Promise<unknown>>()
      .mockRejectedValue(makeStripeMissingCustomerError())

    await expect(
      processUserDeletionExternalWork(request.id, request.processingAttemptId, {
        sanitizeStripeCustomer: sanitizeCustomer,
      }),
    ).resolves.toEqual({ hasMore: true })
    await expect(
      processUserDeletionExternalWork(request.id, request.processingAttemptId, {
        sanitizeStripeCustomer: sanitizeCustomer,
      }),
    ).resolves.toEqual({ hasMore: false })
  })

  it('keeps Stripe work retryable for errors other than a missing customer', async () => {
    const user = await createTestUser()
    const request = await createUserDeletionRequest(user.id, user.id)
    await addUserDeletionExternalWork(request.id, 'stripe-customer', 'cus_retryable')
    await claimUserDeletionAttempt(request.id, request.processingAttemptId)
    const stripeError = Object.assign(new Error('Invalid customer update'), {
      code: 'parameter_invalid_empty',
      param: 'email',
    })
    const sanitizeCustomer = vi
      .fn<(stripeCustomerId: string) => Promise<unknown>>()
      .mockRejectedValueOnce(stripeError)
      .mockResolvedValue({})

    await expect(
      processUserDeletionExternalWork(request.id, request.processingAttemptId, {
        sanitizeStripeCustomer: sanitizeCustomer,
      }),
    ).rejects.toBe(stripeError)
    await expect(
      processUserDeletionExternalWork(request.id, request.processingAttemptId, {
        sanitizeStripeCustomer: sanitizeCustomer,
      }),
    ).resolves.toEqual({ hasMore: true })
  })

  it('does not start provider work after an attempt loses ownership', async () => {
    const user = await createTestUser()
    const request = await createUserDeletionRequest(user.id, user.id)
    await addUserDeletionExternalWork(request.id, 's3-export', 'test/fenced-export.zip')
    const deleteS3 = vi.fn<typeof deleteExportFromS3>().mockResolvedValue(undefined)

    await expect(
      processUserDeletionExternalWork(request.id, randomUUID(), {
        deleteExportFromS3: deleteS3,
      }),
    ).rejects.toThrow('lost ownership')
    expect(deleteS3).not.toHaveBeenCalled()
  })

  it('does not complete provider work after an attempt loses ownership during the call', async () => {
    const user = await createTestUser()
    const request = await createUserDeletionRequest(user.id, user.id)
    await addUserDeletionExternalWork(request.id, 's3-export', 'test/rotated-export.zip')
    await claimUserDeletionAttempt(request.id, request.processingAttemptId)
    const successorAttemptId = randomUUID()
    const deleteS3 = vi.fn<typeof deleteExportFromS3>().mockImplementation(async () => {
      await rotateTestUserDeletionAttemptDuringProviderCall(request.id, successorAttemptId)
    })

    await expect(
      processUserDeletionExternalWork(request.id, request.processingAttemptId, {
        deleteExportFromS3: deleteS3,
      }),
    ).rejects.toThrow('lost ownership')
    await expect(isTestUserDeletionExternalWorkCompleted(request.id)).resolves.toBe(false)
  })

  it('does not complete missing-customer Stripe work after the attempt loses ownership', async () => {
    const user = await createTestUser()
    const request = await createUserDeletionRequest(user.id, user.id)
    await addUserDeletionExternalWork(request.id, 'stripe-customer', 'cus_rotated')
    await claimUserDeletionAttempt(request.id, request.processingAttemptId)
    const successorAttemptId = randomUUID()
    const sanitizeCustomer = vi
      .fn<(stripeCustomerId: string) => Promise<unknown>>()
      .mockImplementation(async () => {
        await rotateTestUserDeletionAttemptDuringProviderCall(request.id, successorAttemptId)
        throw makeStripeMissingCustomerError()
      })

    await expect(
      processUserDeletionExternalWork(request.id, request.processingAttemptId, {
        sanitizeStripeCustomer: sanitizeCustomer,
      }),
    ).rejects.toThrow('lost ownership')
    await expect(isTestUserDeletionExternalWorkCompleted(request.id)).resolves.toBe(false)
  })
})

function makeStripeMissingCustomerError(): Error & { code: string; param: string } {
  return Object.assign(new Error('Provider detail changed'), {
    code: 'resource_missing',
    param: 'id',
  })
}
