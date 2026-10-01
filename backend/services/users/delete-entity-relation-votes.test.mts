import { describe, expect, it } from 'vitest'
import { v7 } from 'uuid'
import {
  beginTransaction,
  countTestUserDeletionEntityRelationVotes,
  createTestUser,
  getEntityRelation,
  insertEntityRelation,
  insertTestPost,
  insertTestTopic,
  insertTestEntityRelationVote,
  insertTopicAliasForTest,
  getTopicAliasIdForTest,
  setTestEntityRelationIdAndScore,
  startPausedTestUserDeletionWriter,
  withTestEntityRelationVoteCandidateCascade,
} from '@voucha/test-helpers'
import { upsertEntityRelationElectionVotes } from '../elections-votes/entity-relation/votes-upsert.mts'
import { createUserDeletionRequest } from '../user-deletions/create.mts'
import { deleteUserEntityRelationVotesBatch } from './delete-entity-relation-votes-batches.mts'
import { recomputeEntityRelationVoteStats } from './delete-entity-relation-votes.mts'
import { deleteUser } from './delete.mts'
import {
  deleteUserAndDrainForTest,
  drainUserDeletionForTest,
} from '@voucha/test-helpers/services/users/delete-test-support'

describe('deleteUser entity-relation vote cleanup', () => {
  it('isolates recomputation for two concrete tables sharing a subject and relation ID', async () => {
    const creator = await createTestUser()
    const firstVoter = await createTestUser()
    const secondVoter = await createTestUser()
    const postId = await insertTestPost({
      title: `Collision recompute ${v7()}`,
      slug: `collision-recompute-${v7()}`,
      createdById: creator.id,
      markdown: 'test',
    })
    const topicId = await insertTestTopic({
      name: `Collision recompute ${v7()}`,
      slug: `collision-recompute-${v7()}`,
      createdById: creator.id,
    })
    const alias = `collision-recompute-${v7()}`
    await insertTopicAliasForTest(topicId, alias)
    const aliasId = await getTopicAliasIdForTest(alias)
    if (!aliasId) throw new Error('Expected topic alias')
    const directTable = 'relation__post__category__topic'
    const aliasTable = 'relation__post__category__topic_alias'
    await insertEntityRelation(directTable, postId, topicId)
    await insertEntityRelation(aliasTable, postId, aliasId)
    const sharedRelationId = v7()
    await setTestEntityRelationIdAndScore(directTable, postId, topicId, sharedRelationId, 0)
    await setTestEntityRelationIdAndScore(aliasTable, postId, aliasId, sharedRelationId, 0)
    await insertTestEntityRelationVote({
      relationTable: directTable,
      relationId: sharedRelationId,
      subjectId: postId,
      userId: firstVoter.id,
      score: 1,
    })
    await insertTestEntityRelationVote({
      relationTable: aliasTable,
      relationId: sharedRelationId,
      subjectId: postId,
      userId: secondVoter.id,
      score: -1,
    })

    await using query = await beginTransaction()
    await recomputeEntityRelationVoteStats(
      [
        { relationTable: directTable, subjectId: postId, entityRelationId: sharedRelationId },
        { relationTable: aliasTable, subjectId: postId, entityRelationId: sharedRelationId },
      ],
      query,
    )
    await query.commit()
    const [direct] = await getEntityRelation(directTable, postId, topicId)
    const [aliased] = await getEntityRelation(aliasTable, postId, aliasId)
    expect(direct).toMatchObject({ votes_count_up: 1, votes_count_down: 0 })
    expect(aliased).toMatchObject({ votes_count_up: 0, votes_count_down: 1 })
  })

  it('deletes only a selected vote when another relation reuses its vote ID', async () => {
    const creator = await createTestUser()
    const deletingVoter = await createTestUser()
    const topicId = await insertTestTopic({
      name: `Collision vote ${v7()}`,
      slug: `collision-vote-${v7()}`,
      createdById: creator.id,
    })
    const posts = await Promise.all(
      [0, 1].map(index =>
        insertTestPost({
          title: `Collision vote ${index} ${v7()}`,
          slug: `collision-vote-${v7()}`,
          createdById: creator.id,
          markdown: 'test',
        }),
      ),
    )
    const table = 'relation__post__category__topic'
    const voteId = v7()
    for (const postId of posts) {
      await insertEntityRelation(table, postId, topicId)
      const [relation] = await getEntityRelation(table, postId, topicId)
      await insertTestEntityRelationVote({
        relationTable: table,
        relationId: (relation as { id: string }).id,
        subjectId: postId,
        userId: deletingVoter.id,
        score: 1,
        id: voteId,
      })
    }
    const request = await createUserDeletionRequest(deletingVoter.id, deletingVoter.id)
    await using query = await beginTransaction()
    const selected = await deleteUserEntityRelationVotesBatch(
      request.id,
      deletingVoter.id,
      1,
      query,
    )
    await query.commit()
    expect(selected).toBe(1)
    await expect(countTestUserDeletionEntityRelationVotes(deletingVoter.id)).resolves.toBe(1)
  })

  it('requires a recheck when a selected vote cascades away before its delete', async () => {
    const creator = await createTestUser()
    const deletingVoter = await createTestUser()
    const topicId = await insertTestTopic({
      name: `Deletion cascade recheck ${v7()}`,
      slug: `deletion-cascade-recheck-${v7()}`,
      createdById: creator.id,
    })
    const firstPostId = await insertTestPost({
      title: `Deletion cascade first ${v7()}`,
      slug: `deletion-cascade-first-${v7()}`,
      createdById: creator.id,
      markdown: 'test',
    })
    const secondPostId = await insertTestPost({
      title: `Deletion cascade second ${v7()}`,
      slug: `deletion-cascade-second-${v7()}`,
      createdById: creator.id,
      markdown: 'test',
    })
    const relationTable = 'relation__post__category__topic'
    await insertEntityRelation(relationTable, firstPostId, topicId)
    await insertEntityRelation(relationTable, secondPostId, topicId)
    const [firstRelation] = await getEntityRelation(relationTable, firstPostId, topicId)
    const [secondRelation] = await getEntityRelation(relationTable, secondPostId, topicId)
    const firstRelationId = (firstRelation as { id: string }).id
    const secondRelationId = (secondRelation as { id: string }).id
    await upsertEntityRelationElectionVotes(deletingVoter.id, [
      { entityId: firstRelationId, score: 1 },
    ])
    await upsertEntityRelationElectionVotes(deletingVoter.id, [
      { entityId: secondRelationId, score: 1 },
    ])
    const request = await createUserDeletionRequest(deletingVoter.id, deletingVoter.id)

    const cascadedPage = await withTestEntityRelationVoteCandidateCascade(
      firstPostId,
      async query => deleteUserEntityRelationVotesBatch(request.id, deletingVoter.id, 1, query),
    )

    expect(cascadedPage).toBe(1)
    await expect(countTestUserDeletionEntityRelationVotes(deletingVoter.id)).resolves.toBe(1)
    await using query = await beginTransaction()
    const remainingPage = await deleteUserEntityRelationVotesBatch(
      request.id,
      deletingVoter.id,
      1,
      query,
    )
    await query.commit()
    expect(remainingPage).toBe(1)
    await expect(countTestUserDeletionEntityRelationVotes(deletingVoter.id)).resolves.toBe(0)
  })

  it('keeps binary Clear zero votes out of relation aggregates after deleting another voter', async () => {
    const creator = await createTestUser()
    const deletingVoter = await createTestUser()
    const remainingVoter = await createTestUser()
    const postId = await insertTestPost({
      title: `Deletion relation votes ${v7()}`,
      slug: `deletion-relation-votes-${v7()}`,
      createdById: creator.id,
      markdown: 'test',
    })
    const topicId = await insertTestTopic({
      name: `Deletion relation votes ${v7()}`,
      slug: `deletion-relation-votes-${v7()}`,
      createdById: creator.id,
    })
    const relationTable = 'relation__post__category__topic'
    await insertEntityRelation(relationTable, postId, topicId)
    const [relation] = await getEntityRelation(relationTable, postId, topicId)
    const relationId = (relation as { id: string }).id

    await upsertEntityRelationElectionVotes(remainingVoter.id, [{ entityId: relationId, score: 0 }])
    await upsertEntityRelationElectionVotes(deletingVoter.id, [{ entityId: relationId, score: 1 }])
    await deleteUserAndDrainForTest(deletingVoter, deletingVoter)

    const [after] = await getEntityRelation(relationTable, postId, topicId)
    expect(after).toMatchObject({ votes_score_none: 0, votes_count_none: 0 })
  })

  it('serializes in-flight votes with the privacy fence and rejects later writes', async () => {
    const creator = await createTestUser()
    const deletingVoter = await createTestUser()
    const postId = await insertTestPost({
      title: `Deletion concurrent votes ${v7()}`,
      slug: `deletion-concurrent-votes-${v7()}`,
      createdById: creator.id,
      markdown: 'test',
    })
    const topicId = await insertTestTopic({
      name: `Deletion concurrent votes ${v7()}`,
      slug: `deletion-concurrent-votes-${v7()}`,
      createdById: creator.id,
    })
    const relationTable = 'relation__post__category__topic'
    await insertEntityRelation(relationTable, postId, topicId)
    const [relation] = await getEntityRelation(relationTable, postId, topicId)
    const relationId = (relation as { id: string }).id

    const writer = await startPausedTestUserDeletionWriter(async query => {
      await upsertEntityRelationElectionVotes(
        deletingVoter.id,
        [{ entityId: relationId, score: 1 }],
        undefined,
        undefined,
        { query, enqueueVoteStats: false },
      )
    })

    let deletionAccepted = false
    const deletion = deleteUser(deletingVoter, deletingVoter).then(attempt => {
      deletionAccepted = true
      return attempt
    })
    await new Promise<void>(resolve => setImmediate(resolve))
    expect(deletionAccepted).toBe(false)

    writer.release()
    await writer.completed
    const attempt = await deletion
    await expect(
      upsertEntityRelationElectionVotes(
        deletingVoter.id,
        [{ entityId: relationId, score: -1 }],
        undefined,
        undefined,
        { enqueueVoteStats: false },
      ),
    ).rejects.toThrow('cannot own new data after deletion')
    await drainUserDeletionForTest(attempt)

    await expect(countTestUserDeletionEntityRelationVotes(deletingVoter.id)).resolves.toBe(0)
  })
})
