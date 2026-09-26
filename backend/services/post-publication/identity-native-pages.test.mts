import { describe, expect, it } from 'vitest'
import { beginTransaction } from '@voucha/test-helpers'
import { createTestPublicationSnapshotWork } from './test-fixtures.mts'
import { listPublicationIdentitySourcePage } from './identity-source-paging.mts'
import { retainStoredPublicationIdentityPage } from './retain-stored-identities.mts'
import { createTestTopicAliasForCategoryMapping } from '@voucha/test-helpers/entities/topic-alias-category-mappings'
import { insertTestPostTopicAliasSourceBatch } from '@voucha/test-helpers/entities/post-publication-dirty-work-batches'
import {
  seedTestPublicationReceipt,
  readTestPublicationRetainedKeys,
  insertTestPublicationTopicSlugFanout,
  insertTestPublicationFeedFanout,
} from '@voucha/test-helpers/entities/post-publication-snapshots'
import {
  insertTestPublicationAdditionalFeedItems,
  insertTestPublicationSourceLessFeedItems,
} from '@voucha/test-helpers/entities/post-publication-feed-pages'
import {
  enableQueryCapture,
  stopTestQueryCapture,
  countCapturedQueriesByAnnotation,
} from '@voucha/test-helpers/query-capture'

describe('native publication identity page progress', () => {
  it('skips source-less item pages without per-item roundtrips or losing later sources', async () => {
    const { candidate, user } = await createTestPublicationSnapshotWork()
    const { topicIds } = await insertTestPublicationTopicSlugFanout(candidate.id, user.id, 1)
    const feedIds = await insertTestPublicationFeedFanout(candidate.id, user.id, topicIds)
    await insertTestPublicationSourceLessFeedItems(candidate.id, 1001)
    await insertTestPublicationAdditionalFeedItems(candidate.id, feedIds[0]!, 1)
    await using query = await beginTransaction()
    let cursor: string | null = null
    let complete = false
    const keys: string[] = []
    enableQueryCapture()
    let queries: ReturnType<typeof stopTestQueryCapture>
    try {
      for (let page = 0; page < 20 && !complete; page += 1) {
        const result = await listPublicationIdentitySourcePage(
          query,
          candidate.id,
          'feed',
          cursor,
          100,
        )
        expect(result.complete || result.cursorValue !== cursor).toBe(true)
        keys.push(...result.keys.map(key => key.uuidValue!))
        cursor = result.cursorValue
        complete = result.complete
      }
    } finally {
      queries = stopTestQueryCapture()
    }
    expect(complete).toBe(true)
    expect(keys).toEqual([feedIds[0], feedIds[0]])
    expect(
      countCapturedQueriesByAnnotation(queries, 'listPublicationIdentityFeedItem'),
    ).toBeLessThanOrEqual(19)
  })
  it('pages many live items of the single root story without losing duplicate feed sources', async () => {
    const { candidate, user } = await createTestPublicationSnapshotWork()
    const { topicIds } = await insertTestPublicationTopicSlugFanout(candidate.id, user.id, 7)
    const feedIds = await insertTestPublicationFeedFanout(candidate.id, user.id, topicIds)
    await insertTestPublicationAdditionalFeedItems(candidate.id, feedIds[0]!, 11)
    await using query = await beginTransaction()
    let kind: string | null = 'feed'
    let cursor: string | null = null
    let complete = false
    const keys: string[] = []
    const pageBound = Math.ceil((feedIds.length + 2 * 12 + 1) / 3) + 1
    for (let page = 0; page < pageBound && !complete; page += 1) {
      const result = await listPublicationIdentitySourcePage(query, candidate.id, kind, cursor, 3)
      expect(result.keys.length).toBeLessThanOrEqual(3)
      expect(result.complete || result.cursorValue !== cursor).toBe(true)
      keys.push(...result.keys.map(key => key.uuidValue!))
      kind = result.cursorKind
      cursor = result.cursorValue
      complete = result.complete
    }
    expect(complete).toBe(true)
    expect(keys).toHaveLength(feedIds.length + 11)
    expect([...new Set(keys)].sort()).toEqual([...feedIds].sort())
  })
  it('advances source rows with null mappings without ending or omitting later branches', async () => {
    const { candidate, user } = await createTestPublicationSnapshotWork()
    const aliasId = await createTestTopicAliasForCategoryMapping({
      alias: `null-${candidate.id}`,
    })
    await insertTestPostTopicAliasSourceBatch({
      postIds: [candidate.id],
      topicAliasId: aliasId,
      contributorId: user.id,
    })
    await using query = await beginTransaction()
    const first = await listPublicationIdentitySourcePage(
      query,
      candidate.id,
      'alias_source',
      null,
      1,
    )
    expect(first.keys).toHaveLength(0)
    expect(first.complete).toBe(false)
    expect(first.cursorKind).toBe('alias_source')
    expect(JSON.parse(first.cursorValue!)).toEqual([aliasId, 'explicit'])
    const next = await listPublicationIdentitySourcePage(
      query,
      candidate.id,
      first.cursorKind,
      first.cursorValue,
      100,
    )
    expect(next.complete).toBe(true)
    expect(next.keys).toEqual(
      expect.arrayContaining([expect.objectContaining({ kind: 'author', uuidValue: user.id })]),
    )
  })
  it('advances duplicate legacy receipt ordinals while retaining the exact unique union', async () => {
    const { candidate, work } = await createTestPublicationSnapshotWork()
    const slug = `duplicate-${candidate.id}`
    await seedTestPublicationReceipt(candidate.id, 'ordinal-progress', {
      topicIds: [],
      identityKeys: Array.from({ length: 5 }, () => ({
        kind: 'post_slug',
        value: slug,
      })),
      sitemapTargets: [{ postType: 'discussion', day: '2026-01-01' }],
    })
    await using query = await beginTransaction()
    const first = await retainStoredPublicationIdentityPage(
      query,
      work.id,
      candidate.id,
      null,
      null,
      2,
    )
    expect(first.keys).toHaveLength(2)
    expect(first).toMatchObject({
      cursorKind: 'identityKeys',
      cursorValue: '1',
      complete: false,
    })
    const second = await retainStoredPublicationIdentityPage(
      query,
      work.id,
      candidate.id,
      first.cursorKind,
      first.cursorValue,
      2,
    )
    expect(second).toMatchObject({
      cursorKind: 'identityKeys',
      cursorValue: '3',
      complete: false,
    })
    const third = await retainStoredPublicationIdentityPage(
      query,
      work.id,
      candidate.id,
      second.cursorKind,
      second.cursorValue,
      2,
    )
    expect(third).toMatchObject({
      cursorKind: 'sitemapTargets',
      cursorValue: '0',
      complete: false,
    })
    const eof = await retainStoredPublicationIdentityPage(
      query,
      work.id,
      candidate.id,
      third.cursorKind,
      third.cursorValue,
      2,
    )
    expect(eof.complete).toBe(true)
    await query.commit()
    expect(
      (await readTestPublicationRetainedKeys(work.id)).filter(key => key.value === slug),
    ).toHaveLength(1)
    expect(await readTestPublicationRetainedKeys(work.id)).toContainEqual({
      kind: 'sitemap_target',
      value: 'discussion:2026-01-01',
    })
  })
})
