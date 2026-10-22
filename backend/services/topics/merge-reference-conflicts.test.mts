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
  withHeldTopicMergeTopicRow,
} from '@voucha/test-helpers/topic-merge-self-relations'
import { waitForTestPostgresLockWaiter } from '@voucha/test-helpers/postgres-lock-wait'
import { seedTopicMergeRetailerCollision } from '@voucha/test-helpers/topic-merge-subtypes'
import { createVoteIntegrityFlag } from '../vote-integrity/create-flag.mts'
import { getTopicByAny } from './get.mts'
import { mergeTopicAliases } from './merge-aliases.mts'

async function createTopics() {
  const admin = await createTestUser({ administrator: true })
  const sourceRow = await createTestTopic({ user: admin })
  const destinationRow = await createTestTopic({ user: admin })
  const source = await getTopicByAny(sourceRow.id)
  const destination = await getTopicByAny(destinationRow.id)
  if (!source || !destination) throw new Error('Test topics not found')
  return { admin, source, destination }
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

  it('rejects an uncovered subtype-reference unique collision with both conflicting owners', async () => {
    const { admin, source, destination } = await createTopics()
    await seedTopicMergeRetailerCollision(source.id, destination.id)
    await expect(mergeTopicAliases(admin, source, destination)).rejects.toMatchObject({
      status: 409,
      code: 'topic_merge_reference_conflict',
      source_id: source.id,
      destination_id: destination.id,
    })
    await expect(getTopicByAny(source.id)).resolves.toMatchObject({ id: source.id })
  })
  it('rejects colliding pending audit flags instead of losing either history row', async () => {
    const { admin, source, destination } = await createTopics()
    const post = await createTestPost({ user: admin })
    const flags = await seedTopicMergeAuditCollision(source.id, destination.id, post.id, admin.id)
    await expect(mergeTopicAliases(admin, source, destination)).rejects.toMatchObject({
      status: 409,
      code: 'topic_merge_reference_conflict',
      source_id: flags.sourceFlagId,
      destination_id: flags.destinationFlagId,
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

    await expect(mergeTopicAliases(admin, child, parent)).rejects.toMatchObject({
      status: 409,
      code: 'topic_merge_reference_conflict',
      source_id: relationId,
      destination_id: flagId,
      message: expect.stringContaining(`relation ${relationId}`),
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

  it('rejects a flag committed after preflight while the merge waits for a topic row', async () => {
    const { admin, source: child, destination: parent } = await createTopics()
    await seedTopicMergeParentEdges([[child.id, parent.id]])
    const { relationId, voteId } = await seedTopicMergeVotedRelatedTopics(
      child.id,
      parent.id,
      admin.id,
    )
    let outcome: Promise<{ value: unknown } | { error: unknown }> | undefined
    let flagId: string | undefined
    try {
      await withHeldTopicMergeTopicRow(parent.id, async holderProcessId => {
        outcome = mergeTopicAliases(admin, child, parent).then(
          value => ({ value }),
          err => ({ error: err }),
        )
        await waitForTestPostgresLockWaiter(holderProcessId, 'mergeTopicAliases lockTopics')
        const flag = await createVoteIntegrityFlag(
          'entity_relation',
          relationId,
          'velocity_spike',
          {},
        )
        if (!flag) throw new Error('Expected a vote integrity flag for the related topics')
        flagId = flag.id
      })
    } finally {
      if (outcome) await outcome
    }
    if (!outcome || !flagId) throw new Error('Expected both a merge outcome and a committed flag')
    expect(await outcome).toMatchObject({
      error: {
        status: 409,
        code: 'topic_merge_reference_conflict',
        source_id: relationId,
        destination_id: flagId,
      },
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
})
