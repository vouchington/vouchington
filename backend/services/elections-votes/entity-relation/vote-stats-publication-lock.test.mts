import { createHash, randomUUID } from 'node:crypto'
import { lockTopicAliasPublicationScopes } from '@services/post-publication'
import {
  beginTransaction,
  getEntityRelation,
  getTopicAliasIdForTest,
  createTestUser,
  insertEntityRelation,
  insertTestRssFeedItem,
  insertTestUrlDirect,
  insertUnlinkedTopicAliasForTest,
} from '@voucha/test-helpers'
import { getEntityRelationMetadataOrThrow } from '@services/entity-relations/metadata'
import { describe, expect, it, vi } from 'vitest'
import { createTestRssFeed } from '../../rss-feeds/test-fixtures.mts'
import { createEntityRelationElectionTarget } from './target.mts'
import { updateEntityRelationElectionVoteStatsFromPrimary } from './vote-stats.mts'
import { upsertEntityRelationElectionVotes } from './votes-upsert.mts'

describe('single entity relation vote stats publication locking', () => {
  it('locks an RSS item hashtag alias scope before waiting on its relation row', async () => {
    const suffix = randomUUID()
    const hostname = `single-vote-stats-lock-${suffix}.example.test`
    const feed = await createTestRssFeed({
      topicHostname: hostname,
      rssFeedUrl: `https://${hostname}/feed.xml`,
    })
    const url = await insertTestUrlDirect(null, `https://${hostname}/item`)
    if (!url) throw new Error('Expected public RSS item URL')
    const alias = `single-vote-stats-lock-${suffix}`
    await insertUnlinkedTopicAliasForTest(alias)
    const aliasId = await getTopicAliasIdForTest(alias)
    if (!aliasId) throw new Error('Expected topic alias')
    const itemId = await insertTestRssFeedItem({
      rssFeedId: feed.id,
      urlId: url.id,
      guid: `single-vote-stats-lock-${suffix}`,
      itemData: { title: 'Single vote stats lock item', link: `https://${hostname}/item` },
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
    const target = createEntityRelationElectionTarget(row.id, relation.table_name)
    const voter = await createTestUser({ administrator: true })
    await upsertEntityRelationElectionVotes(
      voter.id,
      [{ entityId: row.id, score: 1 }],
      undefined,
      relation,
      { enqueueVoteStats: false },
    )
    const relationLocked = Promise.withResolvers<void>()
    const releaseRelation = Promise.withResolvers<void>()
    const holder = holdRelationRowLock()

    async function holdRelationRowLock(): Promise<void> {
      await using query = await beginTransaction()
      await query(
        `/* single vote stats alias lock test */ SELECT 1 FROM relation__rss_feed_item__category__topic_alias WHERE id = $1 FOR UPDATE`,
        [row.id],
      )
      relationLocked.resolve()
      await releaseRelation.promise

      await query.commit()
    }
    await relationLocked.promise

    const updating = updateEntityRelationElectionVoteStatsFromPrimary(target)
    try {
      await vi.waitFor(async () => {
        await expect(lockTopicAliasPublicationScopeWithTimeout(aliasId)).rejects.toMatchObject({
          code: '55P03',
        })
      })
    } finally {
      releaseRelation.resolve()
    }
    await holder
    await updating

    async function lockTopicAliasPublicationScopeWithTimeout(aliasId: string): Promise<void> {
      await using query = await beginTransaction()
      await query(`/* single vote stats alias lock timeout */ SET LOCAL lock_timeout = '50ms'`)
      await lockTopicAliasPublicationScopes(query, [aliasId])
      await query.commit()
    }
  })
})
