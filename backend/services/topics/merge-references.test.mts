import {
  createTestTopic,
  createTestUser,
  createTestPost,
  insertTestCommunity,
  insertTestRssFeedDirect,
} from '@voucha/test-helpers'
import {
  getTopicMergeFeedOwner,
  seedTopicMergeRelations,
  getTopicMergeRelations,
  seedTopicMergeHistory,
  getTopicMergeHistoryAndMetrics,
} from '@voucha/test-helpers/topic-merge-references'
import {
  seedTopicMergeLifetimeStatuses,
  getTopicMergeStatusExtensions,
  seedTopicMergeSpendingFacet,
  getTopicMergeSpendingFacet,
} from '@voucha/test-helpers/topic-merge-subtypes'
import {
  seedTopicMergePostReferences,
  getTopicMergePostReferences,
} from '@voucha/test-helpers/topic-merge-posts'
import {
  seedTopicMergeVotedRelations,
  getTopicMergeVotedRelations,
  seedTopicMergeSubjectRelation,
  getTopicMergeSubjectRelation,
  getTopicMergeSubjectElection,
} from '@voucha/test-helpers/topic-merge-relations'
import { describe, expect, it } from 'vitest'
import { getTopicByAny } from './get.mts'
import { mergeTopicAliases } from './merge-aliases.mts'
import type { Topic } from './types.mts'

async function createFullTestTopic(options: Parameters<typeof createTestTopic>[0]): Promise<Topic> {
  const topic = await createTestTopic(options)
  const fullTopic = await getTopicByAny(topic.id)
  if (!fullTopic) throw new Error(`Test topic not found: ${topic.id}`)
  return fullTopic
}

describe('mergeTopicAliases references', () => {
  it('rejects different locked topic types', async () => {
    const admin = await createTestUser({ administrator: true })
    const source = await createFullTestTopic({ user: admin, topic_type: 'topic' })
    const destination = await createFullTestTopic({ user: admin, topic_type: 'card' })
    await expect(
      mergeTopicAliases(admin, { ...source, topic_type: 'card' }, destination),
    ).rejects.toMatchObject({ status: 409 })
  })

  it('rejects two live feeds before aliases or references change', async () => {
    const admin = await createTestUser({ administrator: true })
    const source = await createFullTestTopic({ user: admin })
    const destination = await createFullTestTopic({ user: admin })
    const sourceFeed = await insertTestRssFeedDirect({ topicId: source.id })
    const destinationFeed = await insertTestRssFeedDirect({ topicId: destination.id })
    await expect(mergeTopicAliases(admin, source, destination)).rejects.toMatchObject({
      status: 409,
      code: 'topic_merge_feed_conflict',
      source_id: sourceFeed.id,
      destination_id: destinationFeed.id,
    })
    await expect(getTopicMergeFeedOwner(sourceFeed.id)).resolves.toBe(source.id)
    await expect(getTopicByAny(source.id)).resolves.toMatchObject({ id: source.id })
  })

  it('repoints the source feed and collapses follow and bidirectional relation collisions', async () => {
    const admin = await createTestUser({ administrator: true })
    const source = await createFullTestTopic({ user: admin })
    const destination = await createFullTestTopic({ user: admin })
    const sourceFeed = await insertTestRssFeedDirect({ topicId: source.id })
    await seedTopicMergeRelations(source.id, destination.id, admin.id)
    const revisionId = await seedTopicMergeHistory(source.id, admin.id)
    await mergeTopicAliases(admin, source, destination)
    await expect(getTopicMergeFeedOwner(sourceFeed.id)).resolves.toBe(destination.id)
    await expect(
      getTopicMergeHistoryAndMetrics(source.id, destination.id, revisionId),
    ).resolves.toEqual({
      history_topic_id: source.id,
      source_metrics_count: 0,
      destination_follow_count: 1,
    })
    await expect(getTopicMergeRelations(source.id, destination.id, admin.id)).resolves.toEqual({
      follows: [{ object_id: destination.id }],
      parents: [{ subject_id: destination.id, object_id: destination.id }],
    })
  })

  it('keeps destination tags, categories, list entries, ratings and votes on collisions', async () => {
    const admin = await createTestUser({ administrator: true })
    const source = await createFullTestTopic({ user: admin })
    const destination = await createFullTestTopic({ user: admin })
    const post = await createTestPost({ user: admin, post_type: 'review' })
    const community = await insertTestCommunity({ createdById: admin.id })
    const fixture = {
      sourceId: source.id,
      destinationId: destination.id,
      postId: post.id,
      userId: admin.id,
      communityId: community.id,
    }
    await seedTopicMergePostReferences(fixture)
    await mergeTopicAliases(admin, source, destination)
    await expect(getTopicMergePostReferences(fixture)).resolves.toEqual([
      { kind: 'category', topic_id: destination.id, value: 0 },
      { kind: 'list', topic_id: destination.id, value: 9 },
      { kind: 'rating', topic_id: destination.id, value: 5 },
      { kind: 'tag', topic_id: destination.id, value: 0 },
      { kind: 'vote', topic_id: destination.id, value: 1 },
    ])
  })

  it('rejects competing lifetime links before any merge write and identifies both owners', async () => {
    const admin = await createTestUser({ administrator: true })
    const source = await createFullTestTopic({ user: admin, topic_type: 'rewards_program_status' })
    const destination = await createFullTestTopic({
      user: admin,
      topic_type: 'rewards_program_status',
    })
    const sourceOwner = await createFullTestTopic({
      user: admin,
      topic_type: 'rewards_program_status',
    })
    const destinationOwner = await createFullTestTopic({
      user: admin,
      topic_type: 'rewards_program_status',
    })
    await seedTopicMergeLifetimeStatuses({
      sourceId: source.id,
      destinationId: destination.id,
      sourceOwnerId: sourceOwner.id,
      destinationOwnerId: destinationOwner.id,
    })
    await expect(mergeTopicAliases(admin, source, destination)).rejects.toMatchObject({
      status: 409,
      code: 'topic_merge_lifetime_version_conflict',
      source_id: sourceOwner.id,
      destination_id: destinationOwner.id,
    })
    await expect(getTopicByAny(source.id)).resolves.toMatchObject({ id: source.id })
  })

  it('repoints the source-only lifetime link while preserving destination subtype attributes', async () => {
    const admin = await createTestUser({ administrator: true })
    const source = await createFullTestTopic({ user: admin, topic_type: 'rewards_program_status' })
    const destination = await createFullTestTopic({
      user: admin,
      topic_type: 'rewards_program_status',
    })
    const owner = await createFullTestTopic({ user: admin, topic_type: 'rewards_program_status' })
    await seedTopicMergeLifetimeStatuses({
      sourceId: source.id,
      destinationId: destination.id,
      sourceOwnerId: owner.id,
    })
    await mergeTopicAliases(admin, source, destination)
    const extensions = await getTopicMergeStatusExtensions([source.id, destination.id, owner.id])
    expect(extensions).toEqual(
      expect.arrayContaining([
        { topic_id: destination.id, lifetime_version_id: null, order_index: 9 },
        { topic_id: owner.id, lifetime_version_id: destination.id, order_index: 0 },
      ]),
    )
    expect(extensions).toHaveLength(2)
  })

  it.each([false, true])(
    'preserves spending facet references when the destination facet exists=%s',
    async destinationFacet => {
      const admin = await createTestUser({ administrator: true })
      const source = await createFullTestTopic({ user: admin })
      const destination = await createFullTestTopic({ user: admin })
      const entryId = await seedTopicMergeSpendingFacet(
        source.id,
        destinationFacet ? destination.id : undefined,
      )
      await mergeTopicAliases(admin, source, destination)
      await expect(
        getTopicMergeSpendingFacet([source.id, destination.id], entryId),
      ).resolves.toEqual({
        facets: [
          {
            topic_id: destination.id,
            default_spending_frequency: destinationFacet ? 'annually' : 'monthly',
          },
        ],
        topicId: destination.id,
      })
    },
  )

  it('preserves destination relation votes and moves source-only ballots before recomputing tallies', async () => {
    const admin = await createTestUser({ administrator: true })
    const otherVoter = await createTestUser()
    const source = await createFullTestTopic({ user: admin })
    const destination = await createFullTestTopic({ user: admin })
    const post = await createTestPost({ user: admin })
    const destinationRelationId = await seedTopicMergeVotedRelations(
      source.id,
      destination.id,
      post.id,
      admin.id,
      otherVoter.id,
    )
    await mergeTopicAliases(admin, source, destination)
    const rows = await getTopicMergeVotedRelations(post.id, [source.id, destination.id])
    expect(rows).toEqual(
      expect.arrayContaining(
        [admin.id, otherVoter.id].map(userId => ({
          id: destinationRelationId,
          object_id: destination.id,
          votes_count_up: 2,
          votes_count_down: 0,
          user_id: userId,
          score: 1,
        })),
      ),
    )
    expect(rows).toHaveLength(2)
  })

  it('rekeys source-subject relations older than the destination with their ballots and audit flags', async () => {
    const admin = await createTestUser({ administrator: true })
    const source = await createFullTestTopic({ user: admin })
    const post = await createTestPost({ user: admin })
    const previousRelationId = await seedTopicMergeSubjectRelation(source.id, post.id, admin.id)
    const destination = await createFullTestTopic({ user: admin })
    await expect(getTopicMergeSubjectElection(previousRelationId)).resolves.toMatchObject({
      id: previousRelationId,
    })
    await mergeTopicAliases(admin, source, destination)
    await expect(getTopicMergeSubjectElection(previousRelationId)).resolves.toBeNull()
    const rows = await getTopicMergeSubjectRelation([source.id, destination.id], post.id)
    expect(rows).toEqual([
      {
        id: expect.any(String),
        subject_id: destination.id,
        user_id: admin.id,
        score: 1,
        votes_count_up: 1,
        flag_type: 'velocity_spike',
      },
    ])
    expect(rows[0]!.id).not.toBe(previousRelationId)
  })
})
