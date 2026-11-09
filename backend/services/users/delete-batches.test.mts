import { countTestUserDeletionCurrentPostVotes } from '@voucha/test-helpers/entities/user-deletion-batch-fixtures'
import { describe, expect, it } from 'vitest'
import { processUserDeletionBatch } from '@services/user-deletions'
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
} from '@voucha/test-helpers'
import { deleteUser } from './delete.mts'
import { processUserDeletionPhaseBatch } from './delete-phases.mts'
import { drainUserDeletionForTest } from '@voucha/test-helpers/services/users/delete-test-support'

describe('user deletion batches', () => {
  it('rejects an unsupported persisted deletion phase', async () => {
    await expect(
      processUserDeletionPhaseBatch({
        requestId: crypto.randomUUID(),
        userId: crypto.randomUUID(),
        processingAttemptId: crypto.randomUUID(),
        phase: 'unknown' as 'posts',
        batchSize: 1,
      }),
    ).rejects.toThrow('Unsupported user deletion phase: unknown')
  })

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

  it('drains current ballots and vote history in bounded batches across posts', async () => {
    const [author, voter] = await Promise.all([createTestUser(), createTestUser()])
    const [firstPost, secondPost] = await Promise.all([
      createTestPost({ user: author }),
      createTestPost({ user: author }),
    ])
    await Promise.all([
      insertTestUserDeletionPostVotes(voter.id, firstPost.id, 2),
      insertTestUserDeletionPostVotes(voter.id, secondPost.id, 1),
    ])
    const attempt = await deleteUser(voter, voter)

    expect(await countTestUserDeletionCurrentPostVotes(voter.id)).toBe(2)
    expect(await countTestUserDeletionPostVotes(voter.id)).toBe(3)
    for (const [expectedCurrent, expectedHistory] of [
      [1, 3],
      [0, 3],
      [0, 2],
      [0, 1],
      [0, 0],
    ]) {
      const result = await processUserDeletionPhaseBatch({
        requestId: attempt.requestId,
        userId: voter.id,
        processingAttemptId: attempt.processingAttemptId,
        phase: 'votes',
        batchSize: 1,
      })
      expect(result.hasMore).toBe(true)
      expect(await countTestUserDeletionCurrentPostVotes(voter.id)).toBe(expectedCurrent)
      expect(await countTestUserDeletionPostVotes(voter.id)).toBe(expectedHistory)
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
})
