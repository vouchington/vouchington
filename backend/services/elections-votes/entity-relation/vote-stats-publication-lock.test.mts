import { captureAddedPublicationEffectsForScope } from '@voucha/test-helpers/publication-effect-jobs'
import { lockTopicAliasPublicationScopes } from '@services/post-publication'
import { createHash, randomUUID } from 'node:crypto'
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
import { describe, expect, it } from 'vitest'
import { createTestRssFeed } from '@voucha/test-helpers/rss-feed-create'
import { createEntityRelationElectionTarget } from './target.mts'
import { updateEntityRelationElectionVoteStatsFromPrimary } from './vote-stats.mts'
import { upsertEntityRelationElectionVotes } from './votes-upsert.mts'

describe('single entity relation vote stats publication locking', () => {
  it('publishes changed item impacts while the alias context scope is held', async () => {
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
    await using holder = await beginTransaction()
    await lockTopicAliasPublicationScopes(holder, [aliasId])
    const jobs = await captureAddedPublicationEffectsForScope(aliasId, async () => {
      await updateEntityRelationElectionVoteStatsFromPrimary(target)
    })
    expect(jobs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          keys: expect.arrayContaining([{ kind: 'impact_rss_feed_item', uuidValue: itemId }]),
        }),
      ]),
    )
    const [updated] = (await getEntityRelation(relation.table_name, itemId, aliasId)) as Array<{
      votes_score_net: number
    }>
    expect(updated?.votes_score_net).toBeGreaterThan(0)
  })
})
