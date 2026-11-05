import '@services/bookmarks'
import { describe, expect, it, onTestFinished } from 'vitest'
import {
  createTestUser,
  createTestTopic,
  getTopicFollowExistsForTest,
  getRssFeedFollowExistsForTest,
} from '@voucha/test-helpers'
import { insertTestRssFeedDirect } from '@voucha/test-helpers/entities/rss-feeds'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { getEntityRelationMetadataOrThrow } from '@services/entity-relations/metadata'
import {
  relationLimitsConfig,
  withRelationLimitAdmission,
} from '@services/entity-relations/relation-limits'
import { upsertEntityRelation } from '@services/entity-relations/upsert'
import { upsertBookmarkAction } from './bookmark.mts'

describe('nested admission reservations', () => {
  it('does not grant a second unwritten slot to an additional nested target', async () => {
    await relationLimitsConfig.waitForInitialization()
    onTestFinished(overrideDynamicConfigFieldsForTest(relationLimitsConfig, { follow_topic: 1 }))
    const user = await createTestUser()
    const [first, second] = await Promise.all([createTestTopic(), createTestTopic()])
    const relation = getEntityRelationMetadataOrThrow({
      subjectType: 'user',
      objectType: 'topic',
      predicate: 'follow',
    })
    await withRelationLimitAdmission(user.id, [{ relation, objectIds: [first.id] }], async () => {
      await expect(
        upsertBookmarkAction(
          user,
          { kind: 'first_party' },
          {
            entityType: 'topic',
            entityId: second.id,
            predicate: 'follow',
          },
        ),
      ).rejects.toMatchObject({ code: 'RELATION_LIMIT_REACHED' })
      await upsertEntityRelation(user, relation, user, [first])
    })
    expect(await getTopicFollowExistsForTest(user.id, first.id)).toBe(true)
    expect(await getTopicFollowExistsForTest(user.id, second.id)).toBe(false)
  })
})

describe('single bookmark admission', () => {
  it('creates a topic follow within the configured limit', async () => {
    await relationLimitsConfig.waitForInitialization()
    onTestFinished(overrideDynamicConfigFieldsForTest(relationLimitsConfig, { follow_topic: 1 }))
    const user = await createTestUser()
    const topic = await createTestTopic()

    await expect(
      upsertBookmarkAction(
        user,
        { kind: 'first_party' },
        {
          entityType: 'topic',
          entityId: topic.id,
          predicate: 'follow',
        },
      ),
    ).resolves.toMatchObject({ object_id: topic.id })
    expect(await getTopicFollowExistsForTest(user.id, topic.id)).toBe(true)
  })

  it('creates a feed follow within the configured limit', async () => {
    await relationLimitsConfig.waitForInitialization()
    onTestFinished(overrideDynamicConfigFieldsForTest(relationLimitsConfig, { follow_rss_feed: 1 }))
    const user = await createTestUser()
    const feed = await insertTestRssFeedDirect({})

    await expect(
      upsertBookmarkAction(
        user,
        { kind: 'first_party' },
        {
          entityType: 'rss_feed',
          entityId: feed.id,
          predicate: 'follow',
        },
      ),
    ).resolves.toMatchObject({ object_id: feed.id })
    expect(await getRssFeedFollowExistsForTest(user.id, feed.id)).toBe(true)
  })
})
