import './index.mts'
import { describe, expect, it, onTestFinished } from 'vitest'
import { createTestPost, createTestTopic, createTestUser } from '@voucha/test-helpers'
import { insertTestRssFeedDirect } from '@voucha/test-helpers/entities/rss-feeds'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { getEntityRelationMetadataOrThrow } from '@services/entity-relations/metadata'
import { relationLimitsConfig } from '@services/entity-relations/relation-limits'
import { upsertEntityRelation } from '@services/entity-relations/upsert'
import { softDeleteEntityRelation } from '@services/entity-relations/delete'

const relations = [
  ['follow', 'user', 'follow_user'],
  ['follow', 'topic', 'follow_topic'],
  ['follow', 'rss_feed', 'follow_rss_feed'],
  ['follow', 'post', 'follow_post'],
  ['subscribe', 'user', 'subscribe_user'],
  ['subscribe', 'post', 'subscribe_post'],
  ['subscribe', 'rss_feed', 'subscribe_rss_feed'],
  ['subscribe_posts', 'topic', 'subscribe_posts_topic'],
  ['subscribe_rss_feed_items', 'topic', 'subscribe_rss_feed_items_topic'],
] as const

describe('follow and subscription limits', () => {
  it.each(relations)(
    'enforces %s %s without blocking an active retry',
    async (predicate, objectType, field) => {
      await relationLimitsConfig.waitForInitialization()
      onTestFinished(overrideDynamicConfigFieldsForTest(relationLimitsConfig, { [field]: 1 }))
      const user = await createTestUser()
      // oxlint-disable-next-line typescript/consistent-return -- Typed objectType switch is exhaustive; Oxlint misses its terminal flow.
      const createObject = async () => {
        switch (objectType) {
          case 'user':
            return createTestUser()
          case 'topic':
            return createTestTopic()
          case 'post':
            return createTestPost()
          case 'rss_feed':
            return insertTestRssFeedDirect({})
        }
      }
      const [first, second] = await Promise.all([createObject(), createObject()])
      const relation = getEntityRelationMetadataOrThrow({
        subjectType: 'user',
        predicate,
        objectType,
      })
      await upsertEntityRelation(user, relation, user, [first])
      await expect(upsertEntityRelation(user, relation, user, [first])).resolves.toHaveLength(1)
      await expect(upsertEntityRelation(user, relation, user, [second])).rejects.toMatchObject({
        status: 409,
        code: 'RELATION_LIMIT_REACHED',
      })
    },
  )

  it('counts a restored row and rejects the whole batch before writing', async () => {
    await relationLimitsConfig.waitForInitialization()
    onTestFinished(overrideDynamicConfigFieldsForTest(relationLimitsConfig, { follow_topic: 2 }))
    const user = await createTestUser()
    const [first, second, third] = await Promise.all([
      createTestTopic(),
      createTestTopic(),
      createTestTopic(),
    ])
    const relation = getEntityRelationMetadataOrThrow({
      subjectType: 'user',
      predicate: 'follow',
      objectType: 'topic',
    })
    await upsertEntityRelation(user, relation, user, [first, second])
    await softDeleteEntityRelation(user, relation, user, [second])
    await expect(
      upsertEntityRelation(user, relation, user, [first, second, third]),
    ).rejects.toMatchObject({ code: 'RELATION_LIMIT_REACHED' })
    await expect(upsertEntityRelation(user, relation, user, [second])).resolves.toHaveLength(1)
    await expect(upsertEntityRelation(user, relation, user, [third])).rejects.toMatchObject({
      code: 'RELATION_LIMIT_REACHED',
    })
  })

  it('does not restore a deleted follow on a replay at capacity', async () => {
    await relationLimitsConfig.waitForInitialization()
    onTestFinished(overrideDynamicConfigFieldsForTest(relationLimitsConfig, { follow_user: 1 }))
    const [user, first, second] = await Promise.all([
      createTestUser(),
      createTestUser(),
      createTestUser(),
    ])
    const relation = getEntityRelationMetadataOrThrow({
      subjectType: 'user',
      predicate: 'follow',
      objectType: 'user',
    })
    await upsertEntityRelation(user, relation, user, [first])
    await softDeleteEntityRelation(user, relation, user, [first])
    await upsertEntityRelation(user, relation, user, [second])
    await expect(
      upsertEntityRelation(user, relation, user, [first], { skipIfDeleted: true }),
    ).resolves.toEqual([])
  })
})
