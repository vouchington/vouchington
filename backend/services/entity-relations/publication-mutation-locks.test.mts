import { createHash, randomUUID } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import {
  beginTransaction,
  createTestUser,
  createTestTopic,
  getEntityRelation,
  getTestPostPublicationDirtyWorkForScope,
  getTopicAliasIdForTest,
  hardDeleteTestTopic,
  insertTestTopic,
  insertTestRssFeedItem,
  insertTestUrlDirect,
  insertUnlinkedTopicAliasForTest,
  insertTestRssFeedDirect,
  isTestPostgresQueryWaitingForLock,
  mergeTopicForTest,
  readAllQueueJobs,
  softDeleteTopic,
} from '@voucha/test-helpers'
import {
  lockPostPublicationRssFeedScopes,
  lockTopicAliasPublicationScopes,
  lockTopicRssFeedPublicationScopes,
} from '@services/post-publication'
import { rssFeedDiscoverability } from '@queues/rss-feed-discoverability/queues'
import { PUBLISHER_TYPE_SLUGS } from '@ts-shared/utils/publisher-types'
import { createTestRssFeed } from '../rss-feeds/test-fixtures.mts'
import { getPublisherTypeTopicId } from '../topics/publisher-type-topics.mts'
import { getEntityRelationMetadataOrThrow } from './metadata.mts'
import { upsertEntityRelation } from './upsert.mts'

describe('entity relation publication mutation locks', () => {
  it('locks an RSS item hashtag alias scope before waiting on the item row', async () => {
    const user = await createTestUser({ administrator: true })
    const suffix = randomUUID()
    const hostname = `relation-lock-${suffix}.example.test`
    const feed = await createTestRssFeed({
      topicHostname: hostname,
      rssFeedUrl: `https://${hostname}/feed.xml`,
    })
    const url = await insertTestUrlDirect(null, `https://${hostname}/item`)
    if (!url) throw new Error('Expected public RSS item URL')
    const alias = `relation-lock-${suffix}`
    await insertUnlinkedTopicAliasForTest(alias)
    const aliasId = await getTopicAliasIdForTest(alias)
    if (!aliasId) throw new Error('Expected topic alias')
    const itemId = await insertTestRssFeedItem({
      rssFeedId: feed.id,
      urlId: url.id,
      guid: `relation-lock-${suffix}`,
      itemData: { title: 'Relation lock item', link: `https://${hostname}/item` },
      contentSha256: createHash('sha256').update(suffix).digest(),
    })
    const relation = getEntityRelationMetadataOrThrow({
      subjectType: 'rss_feed_item',
      objectType: 'topic_alias',
      predicate: 'category',
    })
    const itemLocked = Promise.withResolvers<void>()
    const releaseItem = Promise.withResolvers<void>()
    const holder = holdItemRowLock()

    async function holdItemRowLock(): Promise<void> {
      await using query = await beginTransaction()
      await query(
        `/* relation publication mutation lock test */ SELECT 1 FROM rss_feed_items WHERE id = $1 FOR UPDATE`,
        [itemId],
      )
      itemLocked.resolve()
      await releaseItem.promise

      await query.commit()
    }
    await itemLocked.promise

    const writing = upsertEntityRelation(user, relation, { id: itemId }, [{ id: aliasId }], {
      vote: false,
    })
    try {
      await vi.waitFor(async () => {
        await expect(lockTopicAliasPublicationScopeWithTimeout(aliasId)).rejects.toMatchObject({
          code: '55P03',
        })
      })
    } finally {
      releaseItem.resolve()
    }
    await holder
    await expect(writing).resolves.toHaveLength(1)

    async function lockTopicAliasPublicationScopeWithTimeout(aliasId: string): Promise<void> {
      await using query = await beginTransaction()
      await query(
        `/* relation publication mutation alias timeout */ SET LOCAL lock_timeout = '50ms'`,
      )
      await lockTopicAliasPublicationScopes(query, [aliasId])
      await query.commit()
    }
  })

  it('locks publisher-topic feed scopes before waiting on the subject topic row', async () => {
    expect.hasAssertions()
    const user = await createTestUser({ administrator: true })
    const subject = await createTestTopic({
      user,
      hostname: `publisher-relation-lock-${randomUUID()}.example.test`,
      topic_type: 'rss_feed',
    })
    const publisherTypeId = await getPublisherTypeTopicId('blog')
    if (!publisherTypeId) throw new Error('Expected blog publisher type')
    const feed = await insertTestRssFeedDirect({ topicId: subject.id })
    const relation = getEntityRelationMetadataOrThrow({
      subjectType: 'topic',
      objectType: 'topic',
      predicate: 'publisher_type',
    })
    const topicLocked = Promise.withResolvers<void>()
    const releaseTopic = Promise.withResolvers<void>()
    const holder = holdSubjectTopicRowLock()

    async function holdSubjectTopicRowLock(): Promise<void> {
      await using query = await beginTransaction()
      await query(
        `/* publisher relation publication mutation lock test */
      SELECT 1 FROM topics WHERE id = $1::uuid FOR UPDATE`,
        [subject.id],
      )
      topicLocked.resolve()
      await releaseTopic.promise

      await query.commit()
    }
    await topicLocked.promise

    const writing = upsertEntityRelation(
      user,
      relation,
      { id: subject.id },
      [{ id: publisherTypeId }],
      {
        vote: false,
      },
    )
    try {
      await vi.waitFor(async () => {
        await expect(lockRssFeedPublicationScopeWithTimeout()).rejects.toMatchObject({
          code: '55P03',
        })
      })
    } finally {
      releaseTopic.resolve()
    }
    await holder
    await expect(writing).resolves.toHaveLength(1)

    async function lockRssFeedPublicationScopeWithTimeout(): Promise<void> {
      await using query = await beginTransaction()
      await query(
        `/* publisher relation publication feed timeout */ SET LOCAL lock_timeout = '50ms'`,
      )
      await lockPostPublicationRssFeedScopes(query, [feed.id])
      await query.commit()
    }
  })

  it('rejects a publisher type when its source merges after initial validation', async () => {
    expect.hasAssertions()
    await expectPublisherTypeRevalidationFailure({
      expectedMessage: 'Publisher type tags require a Source topic',
      mutate: async ({ sourceTopicId, userId }) => {
        const mergeDestinationId = await insertTestTopic({
          name: `Publisher type merge destination ${randomUUID()}`,
          slug: `publisher-type-merge-destination-${randomUUID()}`,
          createdById: userId,
          topicType: 'rss_feed',
        })
        await mergeTopicForTest(sourceTopicId, mergeDestinationId, userId)
      },
    })
  })

  it('rejects a publisher type when its allowed object soft-deletes after initial validation', async () => {
    expect.hasAssertions()
    await expectPublisherTypeRevalidationFailure({
      expectedMessage: 'Invalid publisher type: object must be a known publisher type',
      mutate: async ({ publisherTypeTopicId, userId }) => {
        await softDeleteTopic(publisherTypeTopicId, userId)
      },
    })
  })
})

type PublisherTypeRaceFixture = {
  sourceTopicId: string
  publisherTypeTopicId: string
  userId: string
}

async function expectPublisherTypeRevalidationFailure({
  expectedMessage,
  mutate,
}: {
  expectedMessage: string
  mutate: (fixture: PublisherTypeRaceFixture) => Promise<void>
}): Promise<void> {
  const user = await createTestUser({ administrator: true })
  const suffix = randomUUID()
  const sourceTopicId = await insertTestTopic({
    name: `Publisher type source ${suffix}`,
    slug: `publisher-type-source-${suffix}`,
    createdById: user.id,
    topicType: 'rss_feed',
  })
  const feed = await insertTestRssFeedDirect({ topicId: sourceTopicId })
  const publisherTypeSlug = `publisher-type-test-${suffix}`
  let publisherTypeTopicId: string | undefined
  let publisherTypeSlugAdded = false
  let publisherTypeSlugMissing = false
  const publisherTypeLockAcquired = Promise.withResolvers<void>()
  const releasePublisherTypeLock = Promise.withResolvers<void>()
  let holder: Promise<void> | undefined
  let writing: Promise<unknown> | undefined

  try {
    PUBLISHER_TYPE_SLUGS.push(publisherTypeSlug as never)
    publisherTypeSlugAdded = true
    publisherTypeTopicId = await insertTestTopic({
      name: `Publisher type ${suffix}`,
      slug: publisherTypeSlug,
      createdById: user.id,
    })
    const relation = getEntityRelationMetadataOrThrow({
      subjectType: 'topic',
      objectType: 'topic',
      predicate: 'publisher_type',
    })
    holder = holdPublisherTypePublicationLock(
      sourceTopicId,
      publisherTypeLockAcquired,
      releasePublisherTypeLock,
    )
    await publisherTypeLockAcquired.promise

    writing = upsertEntityRelation(
      user,
      relation,
      { id: sourceTopicId },
      [{ id: publisherTypeTopicId }],
      { vote: false },
    ).catch(error => error)
    await vi.waitFor(async () => {
      expect(await isTestPostgresQueryWaitingForLock('lockTopicRssFeedAttachmentLifecycle')).toBe(
        true,
      )
    })

    await mutate({ sourceTopicId, publisherTypeTopicId, userId: user.id })
    releasePublisherTypeLock.resolve()
    await holder

    expect(await writing).toMatchObject({ status: 422, message: expectedMessage })
    await expect(
      getEntityRelation(relation.table_name, sourceTopicId, publisherTypeTopicId),
    ).resolves.toEqual([])
    await expect(
      getTestPostPublicationDirtyWorkForScope({ type: 'rss_feed', id: feed.id }),
    ).resolves.toBeUndefined()
    const discoverabilityJobs = (await readAllQueueJobs(rssFeedDiscoverability)).filter(
      job =>
        job.name === 'processEvaluateRssFeedDiscoverability' &&
        (job.data as { rssFeedId?: string }).rssFeedId === feed.id,
    )
    expect(discoverabilityJobs).toEqual([])
  } finally {
    releasePublisherTypeLock.resolve()
    await Promise.allSettled(
      [holder, writing].filter((promise): promise is Promise<unknown> => !!promise),
    )
    if (publisherTypeSlugAdded) {
      const publisherTypeSlugIndex = PUBLISHER_TYPE_SLUGS.indexOf(publisherTypeSlug as never)
      if (publisherTypeSlugIndex < 0) publisherTypeSlugMissing = true
      else PUBLISHER_TYPE_SLUGS.splice(publisherTypeSlugIndex, 1)
    }
    if (publisherTypeTopicId) await hardDeleteTestTopic(publisherTypeTopicId)
  }
  if (publisherTypeSlugMissing) throw new Error('Expected temporary publisher type slug')
}

async function holdPublisherTypePublicationLock(
  sourceTopicId: string,
  acquired: PromiseWithResolvers<void>,
  release: PromiseWithResolvers<void>,
): Promise<void> {
  await using query = await beginTransaction()
  await lockTopicRssFeedPublicationScopes(query, [sourceTopicId])
  acquired.resolve()
  await release.promise
  await query.commit()
}
