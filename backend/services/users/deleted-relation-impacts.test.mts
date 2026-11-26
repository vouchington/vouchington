import { describe, expect, it } from 'vitest'
import { v7 } from 'uuid'
import {
  countTestUserDeletionEntityRelationVotes,
  createTestUser,
  getEntityRelation,
  insertEntityRelation,
  insertTestEntityRelationVote,
  insertTestPost,
  insertTestTopic,
} from '@voucha/test-helpers'
import {
  deleteTestRetainedRelationIdentity,
  insertTestRetainedRelationIdentity,
} from '@voucha/test-helpers/entities/retained-identities'
import { runBeforePostgresStatementForTest } from '@voucha/test-helpers/injected-failures'
import { getUserDeletionRelationImpactIdsForTest } from '@voucha/test-helpers/services/user-deletions/user-deletion-lifecycle'
import { createUserDeletionRequest } from '@services/user-deletions'
import { deleteUserEntityRelationVotesBatch } from './delete-entity-relation-votes-batches.mts'
import { withUserDeletionTransaction } from './delete-phase-transaction.mts'

describe('retained relation impacts for user deletion', () => {
  it('rolls back ballot deletion if orphan cleanup removes the retained relation before its impact insert', async () => {
    const creator = await createTestUser()
    const voter = await createTestUser()
    const postId = await insertTestPost({
      title: 'Retained relation impact',
      slug: `retained-relation-impact-${v7()}`,
      createdById: creator.id,
      markdown: 'test',
    })
    const topicId = await insertTestTopic({
      name: 'Retained relation impact',
      slug: `retained-relation-impact-${v7()}`,
      createdById: creator.id,
    })
    const relationTable = 'relation__post__category__topic'
    await insertEntityRelation(relationTable, postId, topicId)
    const [relation] = await getEntityRelation(relationTable, postId, topicId)
    const relationId = (relation as { id: string }).id
    await insertTestEntityRelationVote({
      relationTable,
      relationId,
      userId: voter.id,
      subjectId: postId,
      score: 1,
    })
    await insertTestRetainedRelationIdentity(relationTable, postId, relationId)
    const request = await createUserDeletionRequest(voter.id, voter.id)
    const processPage = () =>
      withUserDeletionTransaction(query =>
        deleteUserEntityRelationVotesBatch(request.id, voter.id, 1, query),
      )
    const restore = runBeforePostgresStatementForTest('/* insertDeletedRelationImpacts */', () =>
      deleteTestRetainedRelationIdentity(relationTable, postId, relationId),
    )
    try {
      await expect(processPage()).rejects.toMatchObject({
        code: '23503',
        constraint: 'udri_post__category__topic_target_fkey',
      })
    } finally {
      restore()
    }

    await expect(countTestUserDeletionEntityRelationVotes(voter.id)).resolves.toBe(1)
    await expect(getUserDeletionRelationImpactIdsForTest(request.id)).resolves.toEqual([])
    await expect(processPage()).resolves.toBe(1)
    await expect(countTestUserDeletionEntityRelationVotes(voter.id)).resolves.toBe(0)
    await expect(getUserDeletionRelationImpactIdsForTest(request.id)).resolves.toHaveLength(1)
  })
})
