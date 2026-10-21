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
import { seedTopicMergeAuditCollision } from '@voucha/test-helpers/topic-merge-relations'
import { seedTopicMergeRetailerCollision } from '@voucha/test-helpers/topic-merge-subtypes'
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
})
