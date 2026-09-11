import { randomUUID } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import {
  beginTransaction,
  createTestPost,
  createTestTopic,
  createTestUser,
  getEntityRelation,
  getTestPostPublicationDirtyWorkForScope,
  insertEntityRelation,
  insertTestUrlDirect,
  listTestPostPublicationImpactPostIds,
  listTestPostPublicationImpactTopicIds,
  insertTopicAliasForTest,
  getTopicAliasIdForTest,
} from '@voucha/test-helpers'
import { lockPostPublication } from '@services/post-publication'
import { getEntityRelationMetadataOrThrow } from '@services/entity-relations/metadata'
import { createEntityRelationElectionTarget } from './target.mts'
import { updateEntityRelationElectionVoteStatsFromPrimary } from './vote-stats.mts'
import { upsertEntityRelationElectionVotes } from './votes-upsert.mts'
import { createTestRssFeed } from '../../rss-feeds/test-fixtures.mts'

describe('post topic election publication capture', () => {
  it('takes the post publication lock before waiting on the relation row', async () => {
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
        `/* vote stats publication lock test */ SELECT 1 FROM relation__post__category__topic WHERE id = $1 FOR UPDATE`,
        [row.id],
      )
      relationLocked.resolve()
      await releaseRelation.promise

      await query.commit()
    }
    await relationLocked.promise

    const updating = updateEntityRelationElectionVoteStatsFromPrimary(target)
    try {
      await vi.waitFor(
        async () => {
          await expect(lockPostPublicationWithTimeout()).rejects.toMatchObject({ code: '55P03' })
        },
        { timeout: 3000 },
      )
    } finally {
      releaseRelation.resolve()
    }
    await holder
    await updating

    async function lockPostPublicationWithTimeout(): Promise<void> {
      await using query = await beginTransaction()
      await query(`/* vote stats publication lock timeout */ SET LOCAL lock_timeout = '50ms'`)
      await lockPostPublication(query, post.id)
      await query.commit()
    }
  })

  it('captures only vote-score transitions across public eligibility', async () => {
    const firstVoter = await createTestUser({ administrator: true })
    const secondVoter = await createTestUser({ administrator: true })
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
    const target = createEntityRelationElectionTarget(row!.id, relation.table_name)
    await upsertEntityRelationElectionVotes(
      firstVoter.id,
      [{ entityId: row!.id, score: 1 }],
      undefined,
      relation,
      { enqueueVoteStats: false },
    )
    await updateEntityRelationElectionVoteStatsFromPrimary(target)
    const entered = await getTestPostPublicationDirtyWorkForScope({ type: 'post', id: post.id })
    expect(entered).toBeDefined()
    await expect(listTestPostPublicationImpactTopicIds(entered!.id)).resolves.toEqual([topic.id])
    await upsertEntityRelationElectionVotes(
      secondVoter.id,
      [{ entityId: row!.id, score: 1 }],
      undefined,
      relation,
      { enqueueVoteStats: false },
    )
    await updateEntityRelationElectionVoteStatsFromPrimary(target)
    const nonBoundary = await getTestPostPublicationDirtyWorkForScope({ type: 'post', id: post.id })
    expect(nonBoundary!.generation).toBe(entered!.generation)
    await upsertEntityRelationElectionVotes(
      firstVoter.id,
      [{ entityId: row!.id, score: 0 }],
      undefined,
      relation,
      { enqueueVoteStats: false },
    )
    await updateEntityRelationElectionVoteStatsFromPrimary(target)
    await upsertEntityRelationElectionVotes(
      secondVoter.id,
      [{ entityId: row!.id, score: 0 }],
      undefined,
      relation,
      { enqueueVoteStats: false },
    )
    await updateEntityRelationElectionVoteStatsFromPrimary(target)
    const exited = await getTestPostPublicationDirtyWorkForScope({ type: 'post', id: post.id })
    expect(Number(exited!.generation)).toBeGreaterThan(Number(entered!.generation))
  })

  it('captures alias category vote-score transitions against its canonical topic', async () => {
    const voter = await createTestUser({ administrator: true })
    const post = await createTestPost()
    const topic = await createTestTopic()
    const alias = `publication-vote-${randomUUID()}`
    await insertTopicAliasForTest(topic.id, alias)
    const aliasId = await getTopicAliasIdForTest(alias)
    if (!aliasId) throw new Error('Expected test topic alias')
    const relation = getEntityRelationMetadataOrThrow({
      subjectType: 'post',
      objectType: 'topic_alias',
      predicate: 'category',
    })
    await insertEntityRelation(relation.table_name, post.id, aliasId)
    const [row] = (await getEntityRelation(relation.table_name, post.id, aliasId)) as Array<{
      id: string
    }>
    const target = createEntityRelationElectionTarget(row!.id, relation.table_name)

    await upsertEntityRelationElectionVotes(
      voter.id,
      [{ entityId: row!.id, score: 1 }],
      undefined,
      relation,
      { enqueueVoteStats: false },
    )
    await updateEntityRelationElectionVoteStatsFromPrimary(target)
    const entered = await getTestPostPublicationDirtyWorkForScope({ type: 'post', id: post.id })
    expect(entered).toBeDefined()
    await expect(listTestPostPublicationImpactTopicIds(entered!.id)).resolves.toEqual([topic.id])

    await upsertEntityRelationElectionVotes(
      voter.id,
      [{ entityId: row!.id, score: 0 }],
      undefined,
      relation,
      { enqueueVoteStats: false },
    )
    await updateEntityRelationElectionVoteStatsFromPrimary(target)
    const exited = await getTestPostPublicationDirtyWorkForScope({ type: 'post', id: post.id })
    expect(Number(exited!.generation)).toBeGreaterThan(Number(entered!.generation))
  })

  it('captures related URL vote-score transitions without retaining a topic', async () => {
    const voter = await createTestUser({ administrator: true })
    const post = await createTestPost()
    const url = await insertTestUrlDirect(
      voter.id,
      `https://publication-url-vote-${randomUUID().slice(0, 8)}.example.com`,
    )
    if (!url) throw new Error('Expected test URL')
    const relation = getEntityRelationMetadataOrThrow({
      subjectType: 'post',
      objectType: 'url',
      predicate: 'related',
    })
    await insertEntityRelation(relation.table_name, post.id, url.id)
    const [row] = (await getEntityRelation(relation.table_name, post.id, url.id)) as Array<{
      id: string
    }>
    const target = createEntityRelationElectionTarget(row!.id, relation.table_name)

    await upsertEntityRelationElectionVotes(
      voter.id,
      [{ entityId: row!.id, score: 1 }],
      undefined,
      relation,
      { enqueueVoteStats: false },
    )
    await updateEntityRelationElectionVoteStatsFromPrimary(target)
    const entered = await getTestPostPublicationDirtyWorkForScope({ type: 'post', id: post.id })
    expect(entered).toBeDefined()
    await expect(listTestPostPublicationImpactPostIds(entered!.id)).resolves.toEqual([post.id])
    await expect(listTestPostPublicationImpactTopicIds(entered!.id)).resolves.toEqual([])

    await upsertEntityRelationElectionVotes(
      voter.id,
      [{ entityId: row!.id, score: 0 }],
      undefined,
      relation,
      { enqueueVoteStats: false },
    )
    await updateEntityRelationElectionVoteStatsFromPrimary(target)
    const exited = await getTestPostPublicationDirtyWorkForScope({ type: 'post', id: post.id })
    expect(Number(exited!.generation)).toBeGreaterThan(Number(entered!.generation))
  })

  it('captures publisher_type vote-score transitions for affected RSS feeds', async () => {
    const voter = await createTestUser({ administrator: true })
    const sourceTopic = await createTestTopic({
      hostname: `publisher-vote-${randomUUID().slice(0, 8)}.example.com`,
      topic_type: 'rss_feed',
    })
    const publisherType = await createTestTopic()
    const feed = await createTestRssFeed({ topicId: sourceTopic.id })
    const relation = getEntityRelationMetadataOrThrow({
      subjectType: 'topic',
      objectType: 'topic',
      predicate: 'publisher_type',
    })
    await insertEntityRelation(relation.table_name, sourceTopic.id, publisherType.id)
    const [row] = (await getEntityRelation(
      relation.table_name,
      sourceTopic.id,
      publisherType.id,
    )) as Array<{ id: string }>
    const target = createEntityRelationElectionTarget(row!.id, relation.table_name)

    await upsertEntityRelationElectionVotes(
      voter.id,
      [{ entityId: row!.id, score: 1 }],
      undefined,
      relation,
      { enqueueVoteStats: false },
    )
    await updateEntityRelationElectionVoteStatsFromPrimary(target)
    const entered = await getTestPostPublicationDirtyWorkForScope({ type: 'rss_feed', id: feed.id })
    expect(entered).toBeDefined()

    await upsertEntityRelationElectionVotes(
      voter.id,
      [{ entityId: row!.id, score: 0 }],
      undefined,
      relation,
      { enqueueVoteStats: false },
    )
    await updateEntityRelationElectionVoteStatsFromPrimary(target)
    const exited = await getTestPostPublicationDirtyWorkForScope({ type: 'rss_feed', id: feed.id })
    expect(Number(exited!.generation)).toBeGreaterThan(Number(entered!.generation))
  })
})
