import { createHash, randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
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
  mergeTopicForTest,
  readAllQueueJobs,
  softDeleteTopic,
} from '@voucha/test-helpers'
import type { TransactionQuery } from '@data-stores/psql'
import {
  lockPostPublicationRssFeedScopes,
  lockTopicAliasPublicationScopes,
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
    await expectScopeHeldWhileRowLocked({
      statement: `/* item row lock */ SELECT 1 FROM rss_feed_items WHERE id = $1 FOR UPDATE`,
      values: [itemId],
      marker: 'lockTopicAliasPublicationCaptures',
      write: query =>
        upsertEntityRelation(user, relation, { id: itemId }, [{ id: aliasId }], {
          vote: false,
          query,
        }),
      contend: () =>
        expect(
          lockScopeWithTimeout(query => lockTopicAliasPublicationScopes(query, [aliasId])),
        ).rejects.toMatchObject({ code: '55P03' }),
    })
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
    await expectScopeHeldWhileRowLocked({
      statement: `/* topic row lock */ SELECT 1 FROM topics WHERE id = $1::uuid FOR UPDATE`,
      values: [subject.id],
      marker: 'lockPostPublicationRssFeedScopes',
      write: query =>
        upsertEntityRelation(user, relation, { id: subject.id }, [{ id: publisherTypeId }], {
          vote: false,
          query,
        }),
      contend: () =>
        expect(
          lockScopeWithTimeout(query => lockPostPublicationRssFeedScopes(query, [feed.id])),
        ).rejects.toMatchObject({ code: '55P03' }),
    })
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
          'lockTopicRssFeedAttachmentLifecycle',
          reachedLock,
          releaseLock,
        ),
      },
    ).catch(err => err)
    await reachedLock.promise
    await mutate({ sourceTopicId, publisherTypeTopicId, userId: user.id })
    releaseLock.resolve()

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

async function expectScopeHeldWhileRowLocked(options: {
  statement: string
  values: readonly unknown[]
  marker: string
  write: (query: TransactionQuery) => Promise<{ length: number }>
  contend: () => Promise<unknown>
}): Promise<void> {
  const rowLocked = Promise.withResolvers<void>()
  const releaseRow = Promise.withResolvers<void>()
  const scopeLocked = Promise.withResolvers<void>()
  const holder = holdRowLock(options.statement, options.values, rowLocked, releaseRow)
  await rowLocked.promise
  await using transaction = await beginTransaction()
  const writing = options.write(gateSql(transaction, options.marker, scopeLocked))
  try {
    await scopeLocked.promise
    await options.contend()
  } finally {
    releaseRow.resolve()
    await holder
  }
  await expect(writing).resolves.toHaveLength(1)
  await transaction.commit()
}

async function holdRowLock(
  statement: string,
  values: readonly unknown[],
  locked: PromiseWithResolvers<void>,
  release: PromiseWithResolvers<void>,
): Promise<void> {
  await using query = await beginTransaction()
  await query(statement, values)
  locked.resolve()
  await release.promise
  await query.commit()
}

async function lockScopeWithTimeout(
  lock: (query: TransactionQuery) => Promise<unknown>,
): Promise<void> {
  await using query = await beginTransaction()
  await query(`SET LOCAL lock_timeout = '50ms'`)
  await lock(query)
  await query.commit()
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
