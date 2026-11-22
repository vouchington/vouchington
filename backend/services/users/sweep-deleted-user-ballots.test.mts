import { describe, expect, it } from 'vitest'
import { v7 } from 'uuid'
import { createTestUser, insertTestPost, insertTestTopic } from '@voucha/test-helpers'
import {
  deleteUserAndDrainForTest,
  drainUserDeletionForTest,
} from '@voucha/test-helpers/services/users/delete-test-support'
import {
  advanceTestDeletionToFinalize,
  cleanupTestBallotUserAgents,
  createTestPostCategory,
  getTestOwnedPostBallots,
  insertTestBallotWithPersonalData,
  pruneTestCompletedDeletionRecord,
} from '@voucha/test-helpers/entities/deleted-user-ballots'
import {
  insertTestEntityRelationVote,
  readTestEntityRelationUserVotePage,
} from '@voucha/test-helpers/entities/entity-relation-votes'
import { processUserDeletionBatch } from '@services/user-deletions'
import { getUserDeletionRequestForTest } from '@voucha/test-helpers/services/user-deletions/user-deletion-lifecycle'
import { processUserDeletionPhaseBatch } from './delete-phases.mts'
import { deleteUser } from './delete.mts'
import { deletedUserBallotFamilies } from './deleted-user-ballot-page.mts'
import { sweepDeletedUserBallots } from './sweep-deleted-user-ballots.mts'

function makePost(creatorId: string) {
  return insertTestPost({
    createdById: creatorId,
    slug: `late-ballot-${crypto.randomUUID()}`,
    title: 'Late ballot cleanup test',
    markdown: 'Synthetic ballot parent',
  })
}

describe('deleted-user ballot sweep', () => {
  it('drains late ballots in capped pages and revisits those behind the cursor', async () => {
    const [deleted, active] = await Promise.all([createTestUser(), createTestUser()])
    const postIds = (await Promise.all([makePost(active.id), makePost(active.id)])).toSorted()
    const [first, second] = postIds as [string, string]
    const userIds = [deleted.id, active.id]
    const scope = { userIds, batchSize: 2 }
    await insertTestBallotWithPersonalData({ id: v7(), userId: deleted.id, postId: first })
    await deleteUserAndDrainForTest(deleted, deleted)
    expect(await getTestOwnedPostBallots(userIds, postIds)).toEqual([])

    const [a, b, c, d, neighbor] = [v7(), v7(), v7(), v7(), v7()] as const
    const sharedAgent = await insertTestBallotWithPersonalData({
      id: neighbor,
      userId: active.id,
      postId: first,
      agentKey: neighbor,
    })
    const [orphanAgent] = await Promise.all([
      insertTestBallotWithPersonalData({ id: a, userId: deleted.id, postId: first }),
      insertTestBallotWithPersonalData({ id: b, userId: deleted.id, postId: first }),
      insertTestBallotWithPersonalData({
        id: c,
        userId: deleted.id,
        postId: first,
        agentKey: neighbor,
      }),
      insertTestBallotWithPersonalData({ id: d, userId: deleted.id, postId: second }),
    ])
    const agents = [sharedAgent, orphanAgent]
    expect(await cleanupTestBallotUserAgents(agents)).toEqual(agents.toSorted())
    expect(await getTestOwnedPostBallots(userIds, postIds)).toEqual(
      [a, b, c, d, neighbor].map(id => ({ id, has_personal_data: true })),
    )

    const firstPage = await sweepDeletedUserBallots(scope)
    expect(firstPage.deleted).toBe(2)
    expect(await getTestOwnedPostBallots(userIds, postIds)).toEqual(
      [a, d, neighbor].map(id => ({ id, has_personal_data: true })),
    )
    const behind = v7()
    await insertTestBallotWithPersonalData({ id: behind, userId: deleted.id, postId: first })
    const secondPage = await sweepDeletedUserBallots({ ...scope, position: firstPage.position })
    expect(secondPage.deleted).toBe(2)
    expect(await getTestOwnedPostBallots(userIds, postIds)).toEqual(
      [neighbor, behind].map(id => ({ id, has_personal_data: true })),
    )
    expect(await cleanupTestBallotUserAgents(agents)).toEqual([sharedAgent])

    const rollover = await sweepDeletedUserBallots({
      ...scope,
      position: {
        ...secondPage.position!,
        family: deletedUserBallotFamilies.at(-1)!,
        cursor_owner_id: null,
        cursor_entity_id: null,
        cursor_ballot_id: null,
      },
    })
    expect(rollover.deleted).toBe(0)
    expect((await sweepDeletedUserBallots({ ...scope, position: rollover.position })).deleted).toBe(
      1,
    )
    expect(await getTestOwnedPostBallots(userIds, postIds)).toEqual([
      { id: neighbor, has_personal_data: true },
    ])
  })

  it('unblocks normal finalization when a late ballot arrives after the votes phase', async () => {
    const [deleted, author] = await Promise.all([createTestUser(), createTestUser()])
    const postId = await makePost(author.id)
    const finalizing = await advanceTestDeletionToFinalize(await deleteUser(deleted, deleted))
    const ballotId = v7()
    await insertTestBallotWithPersonalData({ id: ballotId, userId: deleted.id, postId })

    const retry = await processUserDeletionBatch(
      finalizing.requestId,
      finalizing.processingAttemptId,
      {
        processPhaseBatch: processUserDeletionPhaseBatch,
      },
    )
    expect(retry).not.toBeNull()
    expect(await getUserDeletionRequestForTest(finalizing.requestId)).toMatchObject({
      currentPhase: 'finalize',
      completedAt: null,
    })
    expect(await getTestOwnedPostBallots([deleted.id], [postId])).toEqual([
      { id: ballotId, has_personal_data: true },
    ])

    expect((await sweepDeletedUserBallots({ userIds: [deleted.id], batchSize: 1 })).deleted).toBe(1)
    await drainUserDeletionForTest(retry!)
    expect(await getTestOwnedPostBallots([deleted.id], [postId])).toEqual([])
    expect(await getUserDeletionRequestForTest(finalizing.requestId)).toMatchObject({
      completedAt: expect.any(Date),
    })
  })

  it('removes a relation ballot after deletion proof pruning but leaves an unfinished drain alone', async () => {
    const [completed, unfinished, author] = await Promise.all([
      createTestUser(),
      createTestUser(),
      createTestUser(),
    ])
    const [postId, topicId] = await Promise.all([
      makePost(author.id),
      insertTestTopic({
        createdById: author.id,
        slug: `ballot-topic-${v7()}`,
        name: 'Ballot cleanup',
      }),
    ])
    const relationTable = 'relation__post__category__topic'
    const relationId = await createTestPostCategory(postId, topicId)
    await deleteUserAndDrainForTest(completed, completed)
    expect(await pruneTestCompletedDeletionRecord(completed.id)).toBe(1)
    await deleteUser(unfinished, unfinished)
    const ballot = { relationTable, relationId, subjectId: postId, score: 1 as const }
    const completedBallot = v7()
    const unfinishedBallot = v7()
    await Promise.all([
      insertTestEntityRelationVote({ ...ballot, userId: completed.id, id: completedBallot }),
      insertTestEntityRelationVote({ ...ballot, userId: unfinished.id, id: unfinishedBallot }),
    ])

    expect(
      (
        await sweepDeletedUserBallots({
          userIds: [completed.id, unfinished.id],
          batchSize: 2,
          position: {
            family: 'relation__post__category__topic__votes',
            cursor_owner_id: null,
            cursor_entity_id: null,
            cursor_ballot_id: null,
            sweep_upper_bound_id: null,
          },
        })
      ).deleted,
    ).toBe(1)
    await expect(
      readTestEntityRelationUserVotePage(completed.id, relationTable, { limit: 2 }),
    ).resolves.toEqual([])
    await expect(
      readTestEntityRelationUserVotePage(unfinished.id, relationTable, { limit: 2 }),
    ).resolves.toEqual([{ id: unfinishedBallot, entity_relation_id: relationId, score: 1 }])
  })
})
