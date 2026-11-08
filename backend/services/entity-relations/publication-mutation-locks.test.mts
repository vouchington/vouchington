import { createHash, randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  beginTransaction,
  createTestUser,
  getEntityRelation,
  getTopicAliasIdForTest,
  hardDeleteTestTopic,
  insertTestTopic,
  insertTestRssFeedItem,
  insertTestUrlDirect,
  insertUnlinkedTopicAliasForTest,
  insertTestRssFeedDirect,
  mergeTopicForTest,
  readAllQueueJobs,
  softDeleteTopic,
} from '@voucha/test-helpers'
import type { TransactionQuery } from '@data-stores/psql'
import { lockTopicAliasPublicationScopes } from '@services/post-publication'
import { captureAddedPublicationEffectsForScope } from '@voucha/test-helpers/publication-effect-jobs'
import { rssFeedMaintenance } from '@queues/rss-feed-maintenance/queues'
import { PUBLISHER_TYPE_SLUGS } from '@ts-shared/utils/publisher-types'
import { createTestRssFeed } from '@voucha/test-helpers/rss-feed-create'
import { getEntityRelationMetadataOrThrow } from './metadata.mts'
import { upsertEntityRelation } from './upsert.mts'

describe('entity relation publication mutation locks', () => {
  it('publishes an RSS item alias change while the read-only alias scope is held', async () => {
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
    await using holder = await beginTransaction()
    await lockTopicAliasPublicationScopes(holder, [aliasId])
    const jobs = await captureAddedPublicationEffectsForScope(aliasId, async () => {
      await upsertEntityRelation(user, relation, { id: itemId }, [{ id: aliasId }], { vote: false })
    })
    expect(jobs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          scope: { type: 'topic_alias', id: aliasId },
          reason: 'post_topics_changed',
          keys: expect.arrayContaining([{ kind: 'impact_rss_feed_item', uuidValue: itemId }]),
        }),
      ]),
    )
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
  const reachedLock = Promise.withResolvers<void>()
  const releaseLock = Promise.withResolvers<void>()
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
    await using transaction = await beginTransaction()
    writing = upsertEntityRelation(
      user,
      relation,
      { id: sourceTopicId },
      [{ id: publisherTypeTopicId }],
      {
        vote: false,
        query: gateSql(
          transaction,
          'assertPublisherTypeObjectsAreValidInTransaction:topics',
          reachedLock,
          releaseLock,
        ),
      },
    ).catch((err: unknown) => err)
    await reachedLock.promise
    await mutate({ sourceTopicId, publisherTypeTopicId, userId: user.id })
    releaseLock.resolve()

    expect(await writing).toMatchObject({ status: 422, message: expectedMessage })
    await expect(
      getEntityRelation(relation.table_name, sourceTopicId, publisherTypeTopicId),
    ).resolves.toEqual([])
    const discoverabilityJobs = (await readAllQueueJobs(rssFeedMaintenance)).filter(
      job =>
        job.name === 'processEvaluateRssFeedDiscoverability' &&
        (job.data as { rssFeedId?: string }).rssFeedId === feed.id,
    )
    expect(discoverabilityJobs).toEqual([])
  } finally {
    releaseLock.resolve()
    await writing?.catch(() => undefined)
    if (publisherTypeSlugAdded) {
      const publisherTypeSlugIndex = PUBLISHER_TYPE_SLUGS.indexOf(publisherTypeSlug as never)
      if (publisherTypeSlugIndex < 0) publisherTypeSlugMissing = true
      else PUBLISHER_TYPE_SLUGS.splice(publisherTypeSlugIndex, 1)
    }
    if (publisherTypeTopicId) await hardDeleteTestTopic(publisherTypeTopicId)
  }
  if (publisherTypeSlugMissing) throw new Error('Expected temporary publisher type slug')
}

function gateSql(
  query: TransactionQuery,
  marker: string,
  seen: PromiseWithResolvers<void>,
  release?: PromiseWithResolvers<void>,
): TransactionQuery {
  let paused = false
  return Object.assign(
    async (input: string, values?: unknown[]) => {
      const textValue =
        typeof input === 'object' && input !== null && 'text' in input
          ? (input as { text?: unknown }).text
          : undefined
      const text =
        typeof input === 'string' ? input : typeof textValue === 'string' ? textValue : ''
      if (release && !paused && text.includes(marker)) {
        paused = true
        seen.resolve()
        await release.promise
      }
      const result = await query(input, values)
      if (!release && text.includes(marker)) seen.resolve()
      return result
    },
    { client: query.client },
  ) as TransactionQuery
}
