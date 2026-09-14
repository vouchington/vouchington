import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  CONTRIBUTING_USER_AGE_MS,
  createTestUserWithAge,
  insertTestPost,
  insertTestTopic,
  readAllQueueJobs,
} from '@voucha/test-helpers'
import { elections } from '@queues/elections/queues'
import { getEntityRelationMetadataOrThrow } from '@services/entity-relations/metadata'
import { upsertEntityRelation } from '@services/entity-relations/upsert'

describe('non-user-tag entity-relation vote reconciliation', () => {
  it('keeps enqueueing vote-stat reconciliation for adds and votes', async () => {
    const voter = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    const topicId = await insertTestTopic({
      name: `Queue regression ${randomUUID()}`,
      slug: `queue-regression-${randomUUID()}`,
      createdById: voter.id,
    })
    const metadata = getEntityRelationMetadataOrThrow({
      subjectType: 'post',
      predicate: 'category',
      objectType: 'topic',
    })

    const addPostId = await createPost(voter.id)
    const [addedRelation] = await upsertEntityRelation(voter, metadata, { id: addPostId }, [
      { id: topicId },
    ])
    await expect(hasQueuedReconciliation(addedRelation!.id!)).resolves.toBe(true)

    const votePostId = await createPost(voter.id)
    const [votedRelation] = await upsertEntityRelation(
      voter,
      metadata,
      { id: votePostId },
      [{ id: topicId }],
      { vote: false },
    )
    const request = createRequest()
    await request.authenticateAs(voter)
    await request
      .put(`/api/v1/entity-relations/${votedRelation!.id}/vote`)
      .send({ choice: 'confirm' })
      .expect(204)
    await expect(hasQueuedReconciliation(votedRelation!.id!)).resolves.toBe(true)
  })
})

async function createPost(createdById: string): Promise<string> {
  const suffix = randomUUID()
  return insertTestPost({
    title: `Queue regression ${suffix}`,
    slug: `queue-regression-${suffix}`,
    createdById,
    markdown: 'Queue regression',
  })
}

async function hasQueuedReconciliation(relationId: string): Promise<boolean> {
  const jobs = await readAllQueueJobs(elections)
  return jobs.some(job => (job.data as { electionId?: string }).electionId === relationId)
}
