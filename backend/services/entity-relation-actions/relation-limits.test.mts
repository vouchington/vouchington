import { AsyncResource } from 'node:async_hooks'
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
import { upsertBookmarkActions } from './bookmark.mts'

describe('multi-type batch admission', () => {
  it('refuses every table before writing and counts duplicate targets only once', async () => {
    await relationLimitsConfig.waitForInitialization()
    onTestFinished(
      overrideDynamicConfigFieldsForTest(relationLimitsConfig, {
        follow_topic: 1,
        follow_rss_feed: 1,
      }),
    )
    const user = await createTestUser()
    const topic = await createTestTopic()
    const [existing, target] = await Promise.all([
      insertTestRssFeedDirect({}),
      insertTestRssFeedDirect({}),
    ])
    const feedRelation = getEntityRelationMetadataOrThrow({
      subjectType: 'user',
      objectType: 'rss_feed',
      predicate: 'follow',
    })
    await upsertEntityRelation(user, feedRelation, user, [existing])
    await expect(
      upsertBookmarkActions(user, { kind: 'first_party' }, [
        { entityType: 'topic', entityId: topic.id, predicate: 'follow' },
        { entityType: 'rss_feed', entityId: target.id, predicate: 'follow' },
      ]),
    ).rejects.toMatchObject({ code: 'RELATION_LIMIT_REACHED' })
    expect(await getTopicFollowExistsForTest(user.id, topic.id)).toBe(false)
    const topicRelation = getEntityRelationMetadataOrThrow({
      subjectType: 'user',
      objectType: 'topic',
      predicate: 'follow',
    })
    await expect(
      upsertEntityRelation(user, topicRelation, user, [topic, topic]),
    ).resolves.toHaveLength(1)
  })

  it('honors preflight admission when a concurrent follow consumes capacity before writes', async () => {
    await relationLimitsConfig.waitForInitialization()
    onTestFinished(
      overrideDynamicConfigFieldsForTest(relationLimitsConfig, {
        follow_topic: 1,
        follow_rss_feed: 1,
      }),
    )
    const user = await createTestUser()
    const topic = await createTestTopic()
    const [concurrent, target] = await Promise.all([
      insertTestRssFeedDirect({}),
      insertTestRssFeedDirect({}),
    ])
    const feedRelation = getEntityRelationMetadataOrThrow({
      subjectType: 'user',
      objectType: 'rss_feed',
      predicate: 'follow',
    })
    const topicRelation = getEntityRelationMetadataOrThrow({
      subjectType: 'user',
      objectType: 'topic',
      predicate: 'follow',
    })
    const concurrentScope = new AsyncResource('relation-limit-concurrent-follow')
    onTestFinished(() => {
      concurrentScope.emitDestroy()
    })
    await withRelationLimitAdmission(
      user.id,
      [
        { relation: topicRelation, objectIds: [topic.id] },
        { relation: feedRelation, objectIds: [target.id] },
      ],
      async () => {
        await concurrentScope.runInAsyncScope(() =>
          upsertEntityRelation(user, feedRelation, user, [concurrent]),
        )
        await expect(
          upsertBookmarkActions(user, { kind: 'first_party' }, [
            { entityType: 'topic', entityId: topic.id, predicate: 'follow' },
            { entityType: 'rss_feed', entityId: target.id, predicate: 'follow' },
          ]),
        ).resolves.toHaveLength(2)
      },
    )
    expect(await getTopicFollowExistsForTest(user.id, topic.id)).toBe(true)
    expect(await getRssFeedFollowExistsForTest(user.id, target.id)).toBe(true)
    expect(await getRssFeedFollowExistsForTest(user.id, concurrent.id)).toBe(true)
  })
})

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
        upsertBookmarkActions(user, { kind: 'first_party' }, [
          { entityType: 'topic', entityId: second.id, predicate: 'follow' },
        ]),
      ).rejects.toMatchObject({ code: 'RELATION_LIMIT_REACHED' })
      await upsertEntityRelation(user, relation, user, [first])
    })
    expect(await getTopicFollowExistsForTest(user.id, first.id)).toBe(true)
    expect(await getTopicFollowExistsForTest(user.id, second.id)).toBe(false)
  })
})
