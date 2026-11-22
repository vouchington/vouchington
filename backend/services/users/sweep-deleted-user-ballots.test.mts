import { afterEach, describe, expect, it } from 'vitest'
import { v7 } from 'uuid'
import { createTestUser, insertTestPost, insertTestTopic } from '@voucha/test-helpers'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
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
  previousTestUuid,
  pruneTestCompletedDeletionRecord,
  readTestBallotSweepCursor,
  seedTestBallotSweepCursor,
} from '@voucha/test-helpers/entities/deleted-user-ballots'
import {
  insertTestEntityRelationVote,
  readTestEntityRelationUserVotePage,
} from '@voucha/test-helpers/entities/entity-relation-votes'
import { processUserDeletionBatch } from '@services/user-deletions'
import { getUserDeletionRequestForTest } from '@voucha/test-helpers/services/user-deletions/user-deletion-lifecycle'
import { processUserDeletionPhaseBatch } from './delete-phases.mts'
import { deleteUser } from './delete.mts'
import { deletedUserBallotFamilies } from '@services/user-deletions/deleted-user-ballot-page'
import { userDeletionsWorkConfig } from '@services/user-deletions/work-limits'
import { sweepDeletedUserBallots } from './sweep-deleted-user-ballots.mts'

function makePost(creatorId: string) {
  return insertTestPost({
    createdById: creatorId,
    slug: `late-ballot-${crypto.randomUUID()}`,
    title: 'Late ballot cleanup test',
    markdown: 'Synthetic ballot parent',
  })
}

const noPosition = {
  cursor_entity_id: null,
  cursor_ballot_id: null,
}
let restoreBatchSize: (() => void) | undefined

function setBatchSize(size: number) {
  restoreBatchSize = overrideDynamicConfigFieldsForTest(userDeletionsWorkConfig, {
    straggler_ballot_batch_size: size,
  })
}

/** Points the persisted cursor just before the owners, so only their rows are in range. */
function seedCursorBefore(family: string, ownerIds: string[]) {
  const sorted = ownerIds.toSorted()
  return seedTestBallotSweepCursor({
    family,
    cursor_owner_id: previousTestUuid(sorted[0]!),
    ...noPosition,
    sweep_upper_bound_id: sorted.at(-1)!,
  })
}

afterEach(() => restoreBatchSize?.())

describe('deleted-user ballot sweep', () => {
  it('drains late ballots in capped pages from its persisted cursor and revisits behind it', async () => {
    setBatchSize(2)
    const [deleted, active] = await Promise.all([createTestUser(), createTestUser()])
    const postIds = (await Promise.all([makePost(active.id), makePost(active.id)])).toSorted()
    const [first, second] = postIds as [string, string]
    const userIds = [deleted.id, active.id]
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

    expect(deletedUserBallotFamilies).toContain('post_votes')
    await seedCursorBefore('post_votes', [deleted.id])
    expect((await sweepDeletedUserBallots()).deleted).toBe(2)
    expect(await getTestOwnedPostBallots(userIds, postIds)).toEqual(
      [a, d, neighbor].map(id => ({ id, has_personal_data: true })),
    )
    expect(await readTestBallotSweepCursor()).toEqual({
      family: 'post_votes',
      cursor_owner_id: deleted.id,
      cursor_entity_id: first,
      cursor_ballot_id: b,
      sweep_upper_bound_id: deleted.id,
    })

    const behind = v7()
    await insertTestBallotWithPersonalData({ id: behind, userId: deleted.id, postId: first })
    expect((await sweepDeletedUserBallots()).deleted).toBe(2)
    expect(await getTestOwnedPostBallots(userIds, postIds)).toEqual(
      [neighbor, behind].map(id => ({ id, has_personal_data: true })),
    )
    expect(await readTestBallotSweepCursor()).toMatchObject({
      cursor_entity_id: second,
      cursor_ballot_id: d,
    })
    expect(await cleanupTestBallotUserAgents(agents)).toEqual([sharedAgent])

    await seedCursorBefore('post_votes', [deleted.id])
    expect((await sweepDeletedUserBallots()).deleted).toBe(1)
    expect(await getTestOwnedPostBallots(userIds, postIds)).toEqual([
      { id: neighbor, has_personal_data: true },
    ])
  })

  it('creates its cursor on first run and restarts it after the last family', async () => {
    setBatchSize(1)
    const user = await createTestUser()
    await deleteUserAndDrainForTest(user, user)
    await seedTestBallotSweepCursor(null)
    await sweepDeletedUserBallots()
    expect(await readTestBallotSweepCursor()).not.toBeNull()

    await seedCursorBefore(deletedUserBallotFamilies.at(-1)!, [user.id])
    expect((await sweepDeletedUserBallots()).deleted).toBe(0)
    expect(await readTestBallotSweepCursor()).toEqual({
      family: deletedUserBallotFamilies[0],
      cursor_owner_id: null,
      ...noPosition,
      sweep_upper_bound_id: null,
    })
  })

  it('removes a late ballot during finalization without waiting for the sweep', async () => {
    const [deleted, author] = await Promise.all([createTestUser(), createTestUser()])
    const postId = await makePost(author.id)
    const finalizing = await advanceTestDeletionToFinalize(await deleteUser(deleted, deleted))
    const ballotId = v7()
    await insertTestBallotWithPersonalData({ id: ballotId, userId: deleted.id, postId })

    const pass = await processUserDeletionBatch(
      finalizing.requestId,
      finalizing.processingAttemptId,
      { processPhaseBatch: processUserDeletionPhaseBatch },
    )
    expect(await getTestOwnedPostBallots([deleted.id], [postId])).toEqual([])
    expect(pass).not.toBeNull()
    await drainUserDeletionForTest(pass!)
    expect(await getUserDeletionRequestForTest(finalizing.requestId)).toMatchObject({
      completedAt: expect.any(Date),
    })
  })

  it('removes a relation ballot after deletion proof pruning but leaves an unfinished drain alone', async () => {
    setBatchSize(10)
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
        name: `Ballot cleanup ${v7()}`,
      }),
    ])
    const relationTable = 'relation__post__category__topic'
    const relationId = await createTestPostCategory(postId, topicId)
    await deleteUserAndDrainForTest(completed, completed)
    expect(await pruneTestCompletedDeletionRecord(completed.id)).toBe(1)
    await deleteUser(unfinished, unfinished)
    const ballot = { relationTable, relationId, subjectId: postId, score: 1 as const }
    const unfinishedBallot = v7()
    await Promise.all([
      insertTestEntityRelationVote({ ...ballot, userId: completed.id, id: v7() }),
      insertTestEntityRelationVote({ ...ballot, userId: unfinished.id, id: unfinishedBallot }),
    ])

    await seedCursorBefore('relation__post__category__topic__votes', [completed.id, unfinished.id])
    expect((await sweepDeletedUserBallots()).deleted).toBe(1)
    await expect(
      readTestEntityRelationUserVotePage(completed.id, relationTable, { limit: 2 }),
    ).resolves.toEqual([])
    await expect(
      readTestEntityRelationUserVotePage(unfinished.id, relationTable, { limit: 2 }),
    ).resolves.toEqual([{ id: unfinishedBallot, entity_relation_id: relationId, score: 1 }])
  })
})
