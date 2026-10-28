import { describe, expect, it } from 'vitest'
import {
  createTestTopic,
  createTestPost,
  createTestUser,
  insertTestRssFeedDirect,
} from '@voucha/test-helpers'
import {
  getTopicMergeFeedOwner,
  softDeleteTopicMergeFeed,
} from '@voucha/test-helpers/topic-merge-references'
import {
  seedTopicMergeAuditCollision,
  seedTopicMergeParentEdges,
} from '@voucha/test-helpers/topic-merge-relations'
import {
  getTopicMergeFlaggedVotedRelatedTopics,
  seedTopicMergeFlaggedVotedRelatedTopics,
  seedTopicMergeVotedRelatedTopics,
} from '@voucha/test-helpers/topic-merge-self-relations'
import { seedTopicMergeRetailerCollision } from '@voucha/test-helpers/topic-merge-subtypes'
import { createVoteIntegrityFlag } from '../vote-integrity/create-flag.mts'
import { getTopicByAny } from './get.mts'
import { mergeTopicsForTest as mergeTopicAliases } from '@voucha/test-helpers/merge-topics'
import { createTopicMergeOperation, getTopicMergeOperation } from './merge-operations.mts'
import { processTopicMergeOperationPage } from './merge-operation-page.mts'
import type { Topic } from './types.mts'

async function createTopics() {
  const admin = await createTestUser({ administrator: true })
  const sourceRow = await createTestTopic({ user: admin })
  const destinationRow = await createTestTopic({ user: admin })
  const source = await getTopicByAny(sourceRow.id)
  const destination = await getTopicByAny(destinationRow.id)
  if (!source || !destination) throw new Error('Test topics not found')
  return { admin, source, destination }
}

async function runRejectedOperation(
  admin: Awaited<ReturnType<typeof createTestUser>>,
  source: Topic,
  destination: Topic,
) {
  const operation = await createTopicMergeOperation(admin, source, destination)
  let generation: number | null = 0
  for (let page = 0; page < 2000 && generation !== null; page++) {
    generation = await processTopicMergeOperationPage(operation.id, generation)
  }
  expect(generation).toBeNull()
  return getTopicMergeOperation(admin, source.id, operation.id)
}

describe('topic merge reference collision preflight', () => {
  it.each(['source', 'destination'] as const)(
    'ignores a soft-deleted %s feed and repoints its retained reference',
    async deletedOwner => {
      const { admin, source, destination } = await createTopics()
      const sourceFeed = await insertTestRssFeedDirect({ topicId: source.id })
      const destinationFeed = await insertTestRssFeedDirect({ topicId: destination.id })
      await softDeleteTopicMergeFeed(deletedOwner === 'source' ? sourceFeed.id : destinationFeed.id)
      await mergeTopicAliases(admin, source, destination)
      await expect(getTopicMergeFeedOwner(sourceFeed.id)).resolves.toBe(destination.id)
      await expect(getTopicMergeFeedOwner(destinationFeed.id)).resolves.toBe(destination.id)
    },
  )

  it('rejects an uncovered subtype-reference unique collision before moving owners', async () => {
    const { admin, source, destination } = await createTopics()
    await seedTopicMergeRetailerCollision(source.id, destination.id)
    await expect(runRejectedOperation(admin, source, destination)).resolves.toMatchObject({
      status: 'failed',
      error_code: 'topic_merge_reference_conflict',
    })
    await expect(getTopicByAny(source.id)).resolves.toMatchObject({ id: source.id })
  })
  it('rejects colliding pending audit flags instead of losing either history row', async () => {
    const { admin, source, destination } = await createTopics()
    const post = await createTestPost({ user: admin })
    await seedTopicMergeAuditCollision(source.id, destination.id, post.id, admin.id)
    await expect(runRejectedOperation(admin, source, destination)).resolves.toMatchObject({
      status: 'failed',
      error_code: 'topic_merge_reference_conflict',
    })
    await expect(getTopicByAny(source.id)).resolves.toMatchObject({ id: source.id })
  })

  it('rejects a voted child-to-parent self-relation with an unresolved flag', async () => {
    const { admin, source: child, destination: parent } = await createTopics()
    await seedTopicMergeParentEdges([[child.id, parent.id]])
    const { relationId, voteId, flagId } = await seedTopicMergeFlaggedVotedRelatedTopics(
      child.id,
      parent.id,
      admin.id,
    )

    await expect(runRejectedOperation(admin, child, parent)).resolves.toMatchObject({
      status: 'failed',
      error_code: 'topic_merge_reference_conflict',
    })
    await expect(getTopicByAny(child.id)).resolves.toMatchObject({ id: child.id })
    await expect(getTopicMergeFlaggedVotedRelatedTopics(child.id, relationId)).resolves.toEqual([
      {
        relation_id: relationId,
        subject_id: child.id,
        object_id: parent.id,
        vote_id: voteId,
        flag_id: flagId,
        resolved_at: null,
      },
    ])
  })

  it('refuses a new relation flag while the merge reserves its parent', async () => {
    const { admin, source: child, destination: parent } = await createTopics()
    await seedTopicMergeParentEdges([[child.id, parent.id]])
    const { relationId } = await seedTopicMergeVotedRelatedTopics(child.id, parent.id, admin.id)
    const operation = await createTopicMergeOperation(admin, child, parent)
    await expect(
      createVoteIntegrityFlag('entity_relation', relationId, 'velocity_spike', {}),
    ).rejects.toMatchObject({ code: 'topic_merge_in_progress' })
    let generation: number | null = 0
    for (let page = 0; page < 2000 && generation !== null; page++) {
      generation = await processTopicMergeOperationPage(operation.id, generation)
    }
    expect(generation).toBeNull()
    await expect(getTopicMergeOperation(admin, child.id, operation.id)).resolves.toMatchObject({
      status: 'completed',
    })
    await expect(getTopicMergeFlaggedVotedRelatedTopics(child.id, relationId)).resolves.toEqual([])
  })
})
