import { createHash, randomUUID } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import {
  beginTransaction,
  createTestPost,
  createTestTopic,
  getEntityRelation,
  getTopicAliasIdForTest,
  isTestPostPublicationScopeLockHeld,
  insertEntityRelation,
  insertTestRssFeedItem,
  insertTestRssFeedDirect,
  insertTestUrlDirect,
  insertUnlinkedTopicAliasForTest,
  setTestEntityRelationIdAndScore,
} from '@voucha/test-helpers'
import { getEntityRelationMetadataOrThrow } from '@services/entity-relations/metadata'
import { createTestRssFeed } from '../../rss-feeds/test-fixtures.mts'
import { getPublisherTypeTopicId } from '../../topics/publisher-type-topics.mts'
import { createEntityRelationElectionTarget } from './target.mts'
import { updateEntityRelationElectionVoteStatsFromPrimaryBatch } from './vote-stats-batch.mts'

describe('entity relation vote stats batch locking', () => {
  it(
    'locks overlapping relation batches in stable order without deadlocking',
    { timeout: 3000 },
    async () => {
      const firstPost = await createTestPost()
      const secondPost = await createTestPost()
      const firstTopic = await createTestTopic()
      const secondTopic = await createTestTopic()
      const relation = getEntityRelationMetadataOrThrow({
        subjectType: 'post',
        objectType: 'topic',
        predicate: 'category',
      })
      await Promise.all([
        insertEntityRelation(relation.table_name, firstPost.id, firstTopic.id),
        insertEntityRelation(relation.table_name, secondPost.id, secondTopic.id),
      ])
      const [[firstRow], [secondRow]] = (await Promise.all([
        getEntityRelation(relation.table_name, firstPost.id, firstTopic.id),
        getEntityRelation(relation.table_name, secondPost.id, secondTopic.id),
      ])) as Array<Array<{ id: string }>>
      if (!firstRow || !secondRow) throw new Error('Expected post topic relations')
      const first = createEntityRelationElectionTarget(firstRow.id, relation.table_name)
      const second = createEntityRelationElectionTarget(secondRow.id, relation.table_name)

      await expect(
        Promise.all([
          updateEntityRelationElectionVoteStatsFromPrimaryBatch([first, second]),
          updateEntityRelationElectionVoteStatsFromPrimaryBatch([second, first]),
        ]),
      ).resolves.toEqual([[], []])
    },
  )

  it('locks post publication before waiting on a target relation row', async () => {
    const post = await createTestPost()
    const topic = await createTestTopic()
    const relation = getEntityRelationMetadataOrThrow({
      subjectType: 'post',
      objectType: 'topic',
      predicate: 'category',
    })
    await insertEntityRelation(relation.table_name, post.id, topic.id)
    const [row] = (await getEntityRelation(relation.table_name, post.id, topic.id)) as Array<{
      id: string
    }>
    if (!row) throw new Error('Expected post topic relation')
    await setTestEntityRelationIdAndScore(relation.table_name, post.id, topic.id, row.id, 1)
    const target = createEntityRelationElectionTarget(row.id, relation.table_name)
    const relationLocked = Promise.withResolvers<void>()
    const releaseRelation = Promise.withResolvers<void>()
    const holder = holdRelationRowLock()

    async function holdRelationRowLock(): Promise<void> {
      await using query = await beginTransaction()
      await query(
        `/* vote stats batch publication lock test */ SELECT 1 FROM relation__post__category__topic WHERE id = $1 FOR UPDATE`,
        [row.id],
      )
      relationLocked.resolve()
      await releaseRelation.promise

      await query.commit()
    }
    await relationLocked.promise

    const updating = updateEntityRelationElectionVoteStatsFromPrimaryBatch([target])
    try {
      await vi.waitFor(
        async () => {
          await expect(
            isTestPostPublicationScopeLockHeld({ type: 'post', id: post.id }),
          ).resolves.toBe(true)
        },
        { timeout: 10_000 },
      )
    } finally {
      releaseRelation.resolve()
    }
    await holder
    await updating
  })

  it('locks an RSS item hashtag alias scope before waiting on a target relation row', async () => {
    const suffix = randomUUID()
    const hostname = `vote-stats-lock-${suffix}.example.test`
    const feed = await createTestRssFeed({
      topicHostname: hostname,
      rssFeedUrl: `https://${hostname}/feed.xml`,
    })
    const url = await insertTestUrlDirect(null, `https://${hostname}/item`)
    if (!url) throw new Error('Expected public RSS item URL')
    const alias = `vote-stats-lock-${suffix}`
    await insertUnlinkedTopicAliasForTest(alias)
    const aliasId = await getTopicAliasIdForTest(alias)
    if (!aliasId) throw new Error('Expected topic alias')
    const itemId = await insertTestRssFeedItem({
      rssFeedId: feed.id,
      urlId: url.id,
      guid: `vote-stats-lock-${suffix}`,
      itemData: { title: 'Vote stats lock item', link: `https://${hostname}/item` },
      contentSha256: createHash('sha256').update(suffix).digest(),
    })
    const relation = getEntityRelationMetadataOrThrow({
      subjectType: 'rss_feed_item',
      objectType: 'topic_alias',
      predicate: 'category',
    })
    await insertEntityRelation(relation.table_name, itemId, aliasId)
    const [row] = (await getEntityRelation(relation.table_name, itemId, aliasId)) as Array<{
      id: string
    }>
    if (!row) throw new Error('Expected RSS item hashtag relation')
    await setTestEntityRelationIdAndScore(relation.table_name, itemId, aliasId, row.id, 1)
    const target = createEntityRelationElectionTarget(row.id, relation.table_name)
    const relationLocked = Promise.withResolvers<void>()
    const releaseRelation = Promise.withResolvers<void>()
    const holder = holdRelationRowLock()

    async function holdRelationRowLock(): Promise<void> {
      await using query = await beginTransaction()
      await query(
        `/* vote stats batch alias lock test */ SELECT 1 FROM relation__rss_feed_item__category__topic_alias WHERE id = $1 FOR UPDATE`,
        [row.id],
      )
      relationLocked.resolve()
      await releaseRelation.promise

      await query.commit()
    }
    await relationLocked.promise

    const updating = updateEntityRelationElectionVoteStatsFromPrimaryBatch([target])
    try {
      await vi.waitFor(
        async () => {
          await expect(
            isTestPostPublicationScopeLockHeld({ type: 'topic_alias', id: aliasId }),
          ).resolves.toBe(true)
        },
        { timeout: 10_000 },
      )
    } finally {
      releaseRelation.resolve()
    }
    await holder
    await updating
  })

  it('locks publisher-topic feed scopes before waiting on a target relation row', async () => {
    expect.hasAssertions()
    const sourceTopic = await createTestTopic({
      hostname: `batch-publisher-lock-${randomUUID()}.example.test`,
      topic_type: 'rss_feed',
    })
    const publisherTypeId = await getPublisherTypeTopicId('blog')
    if (!publisherTypeId) throw new Error('Expected blog publisher type')
    const feed = await insertTestRssFeedDirect({ topicId: sourceTopic.id })
    const relation = getEntityRelationMetadataOrThrow({
      subjectType: 'topic',
      objectType: 'topic',
      predicate: 'publisher_type',
    })
    await insertEntityRelation(relation.table_name, sourceTopic.id, publisherTypeId)
    const [row] = (await getEntityRelation(
      relation.table_name,
      sourceTopic.id,
      publisherTypeId,
    )) as Array<{ id: string }>
    if (!row) throw new Error('Expected publisher topic relation')
    await setTestEntityRelationIdAndScore(
      relation.table_name,
      sourceTopic.id,
      publisherTypeId,
      row.id,
      1,
    )
    const target = createEntityRelationElectionTarget(row.id, relation.table_name)
    const relationLocked = Promise.withResolvers<void>()
    const releaseRelation = Promise.withResolvers<void>()
    const holder = holdRelationRowLock()

    async function holdRelationRowLock(): Promise<void> {
      await using query = await beginTransaction()
      await query(
        `/* vote stats batch publisher feed lock test */
      SELECT 1 FROM relation__topic__publisher_type__topic WHERE id = $1 FOR UPDATE`,
        [row.id],
      )
      relationLocked.resolve()
      await releaseRelation.promise

      await query.commit()
    }
    await relationLocked.promise

    const updating = updateEntityRelationElectionVoteStatsFromPrimaryBatch([target])
    try {
      await vi.waitFor(
        async () => {
          await expect(
            isTestPostPublicationScopeLockHeld({ type: 'rss_feed', id: feed.id }),
          ).resolves.toBe(true)
        },
        { timeout: 10_000 },
      )
    } finally {
      releaseRelation.resolve()
    }
    await holder
    await expect(updating).resolves.toEqual([target])
  })
})
