import { it, expect, describe } from 'vitest'
import { upsertEntityRelation } from '@services/entity-relations/upsert'
import { entityRelationMetadatum } from '@services/entity-relations/metadata'
import {
  createTestPost,
  createTestTopic,
  createTestUser,
  flushPendingTasks,
  getEntityRelationVoteStorageRows,
  hardDeleteEntityRelationTest,
  readAllQueueJobs,
} from '@voucha/test-helpers'
import { elections } from '@queues/elections/queues'
import { getEntityRelationElectionVote } from '../votes-get.mts'
import { upsertEntityRelationElectionVotes } from '../votes-upsert.mts'

describe('upsert.generated (votes)', () => {
  it('rejects metadata for a relation that does not support elections', async () => {
    const metadata = entityRelationMetadatum.find(candidate => !candidate.election)!

    await expect(
      upsertEntityRelationElectionVotes(
        '00000000-0000-0000-0000-000000000001',
        [{ entityId: '00000000-0000-0000-0000-000000000002', score: 1 }],
        undefined,
        metadata,
      ),
    ).rejects.toThrow(`Entity relation ${metadata.table_name} does not support election votes`)
  })

  it('upsertEntityRelation automatically votes when relation has election (default behavior)', async () => {
    const user = await createTestUser()
    const topic = await createTestTopic()
    const post = await createTestPost()

    const metadata = entityRelationMetadatum.find(
      m => m.subject_type === 'topic' && m.object_type === 'post' && m.predicate === 'related',
    )!
    expect(metadata.election).toBe(true) // Verify this relation has election enabled

    const relations = await upsertEntityRelation(user!, metadata, topic, [post])

    expect(relations.length).toBe(1)
    expect(relations[0].id).toBeDefined()

    // Verify vote was created
    const vote = await getEntityRelationElectionVote(user!.id, relations[0].id!)
    expect(vote).not.toBeNull()
    expect(vote!.user_id).toBe(user!.id)
    expect(vote!.entity_id).toBe(relations[0].id)
    expect(vote!.choice).toBe('confirm')
  })

  it('re-enqueues aggregate repair for an idempotent internal auto-vote', async () => {
    const user = await createTestUser()
    const topic = await createTestTopic({ user })
    const post = await createTestPost({ user })
    const metadata = entityRelationMetadatum.find(
      candidate =>
        candidate.subject_type === 'topic' &&
        candidate.object_type === 'post' &&
        candidate.predicate === 'related',
    )!
    const [relation] = await upsertEntityRelation(user, metadata, topic, [post], {
      enqueueVoteStats: false,
    })
    const relationId = relation!.id!

    await expect(
      upsertEntityRelationElectionVotes(
        user.id,
        [{ entityId: relationId, score: 1 }],
        undefined,
        metadata,
      ),
    ).resolves.toEqual([])
    await flushPendingTasks()

    const jobs = await readAllQueueJobs(elections)
    expect(
      jobs.some(job => {
        const data = job.data as { electionId?: string; relationTable?: string }
        return data.electionId === relationId && data.relationTable === metadata.table_name
      }),
    ).toBe(true)
  })

  it('upsertEntityRelation votes when options.vote is explicitly true', async () => {
    const user = await createTestUser()
    const topic = await createTestTopic()
    const post = await createTestPost()

    const metadata = entityRelationMetadatum.find(
      m => m.subject_type === 'topic' && m.object_type === 'post' && m.predicate === 'faq',
    )!
    expect(metadata.election).toBe(true) // Verify this relation has election enabled

    const relations = await upsertEntityRelation(user!, metadata, topic, [post], { vote: true })

    expect(relations.length).toBe(1)
    expect(relations[0].id).toBeDefined()

    // Verify vote was created
    const vote = await getEntityRelationElectionVote(user!.id, relations[0].id!)
    expect(vote).not.toBeNull()
    expect(vote!.choice).toBe('confirm')
  })

  it('upsertEntityRelation does not vote when options.vote is false', async () => {
    const user = await createTestUser()
    const topic = await createTestTopic()
    const post = await createTestPost()

    const metadata = entityRelationMetadatum.find(
      m => m.subject_type === 'topic' && m.object_type === 'post' && m.predicate === 'related',
    )!
    expect(metadata.election).toBe(true) // Verify this relation has election enabled

    const relations = await upsertEntityRelation(user!, metadata, topic, [post], { vote: false })

    expect(relations.length).toBe(1)
    expect(relations[0].id).toBeDefined()

    // Verify vote was NOT created
    const vote = await getEntityRelationElectionVote(user!.id, relations[0].id!)
    expect(vote).toBeNull()
  })

  it('upsertEntityRelation votes for multiple relations with elections', async () => {
    const user = await createTestUser()
    const topic = await createTestTopic()
    const post1 = await createTestPost()
    const post2 = await createTestPost()

    const metadata = entityRelationMetadatum.find(
      m => m.subject_type === 'topic' && m.object_type === 'post' && m.predicate === 'related',
    )!
    expect(metadata.election).toBe(true)

    const relations = await upsertEntityRelation(user!, metadata, topic, [post1, post2])

    expect(relations.length).toBe(2)

    // Verify votes were created for both relations
    const electionIds = relations.flatMap(r => (r.id ? [r.id] : []))
    expect(electionIds.length).toBe(2)

    for (const electionId of electionIds) {
      const vote = await getEntityRelationElectionVote(user!.id, electionId)
      expect(vote).not.toBeNull()
      expect(vote!.choice).toBe('confirm')
    }
  })

  it('upsertEntityRelation auto-votes for official accounts on structural relations', async () => {
    // Official accounts (e.g. administrators) are permitted to curate structural
    // entity relations; the isOfficialAccount guard was removed in #4685.
    const user = await createTestUser({ administrator: true })
    const topic = await createTestTopic()
    const post = await createTestPost()

    const metadata = entityRelationMetadatum.find(
      m => m.subject_type === 'topic' && m.object_type === 'post' && m.predicate === 'related',
    )!
    expect(metadata.election).toBe(true)

    const relations = await upsertEntityRelation(user!, metadata, topic, [post])

    expect(relations.length).toBe(1)
    expect(relations[0].id).toBeDefined()

    const vote = await getEntityRelationElectionVote(user!.id, relations[0].id!)
    expect(vote).not.toBeNull()
    expect(vote!.choice).toBe('confirm')
  })

  it('routes one vote batch across concrete relation tables and cascades hard deletes', async () => {
    const user = await createTestUser()
    const topic = await createTestTopic({ user })
    const post = await createTestPost({ user })
    const topicPostMetadata = entityRelationMetadatum.find(
      metadata =>
        metadata.subject_type === 'topic' &&
        metadata.object_type === 'post' &&
        metadata.predicate === 'related',
    )!
    const postTopicMetadata = entityRelationMetadatum.find(
      metadata =>
        metadata.subject_type === 'post' &&
        metadata.object_type === 'topic' &&
        metadata.predicate === 'category',
    )!
    const [topicPostRelation] = await upsertEntityRelation(user, topicPostMetadata, topic, [post], {
      vote: false,
    })
    const [postTopicRelation] = await upsertEntityRelation(user, postTopicMetadata, post, [topic], {
      vote: false,
    })

    const votes = await upsertEntityRelationElectionVotes(user.id, [
      { entityId: topicPostRelation.id!, score: 1 },
      { entityId: postTopicRelation.id!, score: -1 },
    ])

    expect(votes).toHaveLength(2)
    await expect(
      getEntityRelationElectionVote(user.id, topicPostRelation.id!),
    ).resolves.toMatchObject({ entity_id: topicPostRelation.id, choice: 'confirm' })
    await expect(
      getEntityRelationElectionVote(user.id, postTopicRelation.id!),
    ).resolves.toMatchObject({ entity_id: postTopicRelation.id, choice: 'dispute' })

    await expect(
      upsertEntityRelationElectionVotes(user.id, [{ entityId: topicPostRelation.id!, score: -1 }]),
    ).resolves.toMatchObject([{ entity_id: topicPostRelation.id, score: -1 }])
    await expect(
      getEntityRelationElectionVote(user.id, topicPostRelation.id!),
    ).resolves.toMatchObject({ entity_id: topicPostRelation.id, choice: 'dispute' })
    expect(
      (await getEntityRelationVoteStorageRows([topicPostRelation.id!, postTopicRelation.id!]))
        .map(row => row.storage_table)
        .sort(),
    ).toEqual([
      'relation__post__category__topic__votes__default',
      'relation__topic__related__post__votes__default',
      'relation__topic__related__post__votes__default',
    ])

    await hardDeleteEntityRelationTest(topicPostMetadata.table_name, topic.id, post.id)
    await hardDeleteEntityRelationTest(postTopicMetadata.table_name, post.id, topic.id)

    await expect(
      getEntityRelationVoteStorageRows([topicPostRelation.id!, postTopicRelation.id!]),
    ).resolves.toEqual([])
    await expect(getEntityRelationElectionVote(user.id, topicPostRelation.id!)).resolves.toBeNull()
    await expect(getEntityRelationElectionVote(user.id, postTopicRelation.id!)).resolves.toBeNull()
  })
})
