import { describe, expect, it, onTestFinished } from 'vitest'
import {
  createTestRssFeedItemWithUrl,
  createTestRssFeedWithTiming,
  createTestTopic,
} from '@voucha/test-helpers'
import { addCategoryToRssFeedItem } from '@voucha/test-helpers/entities/rss-feed-item-category-fixtures'
import { insertTestStory, setTestItemStoryId } from '@voucha/test-helpers/entities/stories'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { postPublicationWorkConfig } from '@services/post-publication/work-limits'
import {
  readCandidateFixture,
  addCandidateSource,
  setCandidatePublication,
  deleteCandidateItem,
  setCandidateTopicClaim,
  setCandidateHidden,
  insertCandidateInOneStatement,
} from '@voucha/test-helpers/rss-feed-candidates'
import {
  getCandidateReconciliation,
  getCandidateReconciliationPage,
  getCandidateReconciliationUpperBound,
} from './candidate-reconciliation-state.mts'
import { reconcileRssFeedItemCandidatePage } from './reconcile-feed-candidate.mts'

describe('RSS feed candidate projections', () => {
  it('projects sources and topics when the item and children are inserted in one statement', async () => {
    const topic = await createTestTopic()
    const feed = await createTestRssFeedWithTiming((await createTestTopic()).id)
    const itemId = await insertCandidateInOneStatement(feed, topic.id)
    const state = await readCandidateFixture(itemId, [feed])
    expect(state.sources[0]!.item_sort_at).toEqual(state.candidate!.sort_at)
    expect(state.topics[0]!.sort_at).toEqual(state.candidate!.sort_at)
    expect(state.feeds[0]!.latest_item_sort_at).toEqual(state.candidate!.sort_at)
  })
  it('projects story/date order, tracks date changes, and cascades item deletion', async () => {
    const feed = await createTestRssFeedWithTiming((await createTestTopic()).id)
    const item = await createTestRssFeedItemWithUrl(feed)
    const story = await insertTestStory()
    await setTestItemStoryId(item.id, story.id)
    const state = await readCandidateFixture(item.id, [feed])
    expect(state.candidate).toMatchObject({
      story_id: story.id,
    })
    expect(state.sources[0]!.item_sort_at).toEqual(state.candidate!.sort_at)
    expect(state.feeds[0]!.latest_item_sort_at).toEqual(state.candidate!.sort_at)
    const revisedDate = new Date(Date.now() - 2 * 60_000)
    await setCandidatePublication(item.id, revisedDate)
    expect((await readCandidateFixture(item.id, [feed])).candidate!.sort_at).toEqual(revisedDate)
    await addCategoryToRssFeedItem(item.id, (await createTestTopic()).id)
    expect(await getCandidateReconciliation(item.id)).toBeDefined()
    await deleteCandidateItem(item.id)
    const deleted = await readCandidateFixture(item.id, [feed])
    expect(deleted.candidate).toBeUndefined()
    expect(deleted.sources).toEqual([])
    expect(deleted.topics).toEqual([])
    expect(deleted.feeds[0]!.latest_item_sort_at).toBeNull()
    expect(await getCandidateReconciliation(item.id)).toBeUndefined()
  })

  it('coalesces category and voted topic claims and removes only the last contribution', async () => {
    const topic = await createTestTopic()
    const feed = await createTestRssFeedWithTiming((await createTestTopic()).id)
    const item = await createTestRssFeedItemWithUrl(feed)
    await addCategoryToRssFeedItem(item.id, topic.id, `candidate-${item.id}`)
    await setCandidateTopicClaim(item.id, topic.id, 1)
    expect((await readCandidateFixture(item.id, [feed])).topics).toMatchObject([
      { topic_id: topic.id, membership_count: '2' },
    ])
    await setCandidateTopicClaim(item.id, topic.id, 2)
    expect((await readCandidateFixture(item.id, [feed])).topics[0]!.membership_count).toBe('2')
    await setCandidateTopicClaim(item.id, topic.id, 0)
    expect((await readCandidateFixture(item.id, [feed])).topics).toMatchObject([
      { topic_id: topic.id, membership_count: '1' },
    ])
    await setCandidateTopicClaim(item.id, topic.id, 1)
    await deleteCandidateItem(item.id)
    expect((await readCandidateFixture(item.id, [feed])).topics).toEqual([])
  })

  it('reads an owned reconciliation row through the bounded UUID keyset page', async () => {
    let itemId: string | undefined
    onTestFinished(async () => {
      if (itemId) await deleteCandidateItem(itemId)
    })
    const feed = await createTestRssFeedWithTiming((await createTestTopic()).id)
    const item = await createTestRssFeedItemWithUrl(feed)
    itemId = item.id
    await setCandidatePublication(item.id, new Date(Date.now() - 60_000))

    expect(await getCandidateReconciliationUpperBound()).not.toBeNull()
    expect(
      await getCandidateReconciliationPage({
        afterId: uuidImmediatelyBefore(item.id),
        throughId: item.id,
        limit: 1,
      }),
    ).toEqual([item.id])
    expect(
      await getCandidateReconciliationPage({
        afterId: item.id,
        throughId: item.id,
        limit: 1,
      }),
    ).toEqual([])
  })

  it('persists bounded source/topic progress, resets on a new date, and completes retried work', async () => {
    onTestFinished(
      overrideDynamicConfigFieldsForTest(postPublicationWorkConfig, {
        rss_feed_candidate_page_size: 1,
      }),
    )
    const feeds = await Promise.all(
      [1, 2].map(async () => createTestRssFeedWithTiming((await createTestTopic()).id)),
    )
    const item = await createTestRssFeedItemWithUrl(feeds[0]!)
    const outside = await createTestRssFeedItemWithUrl(feeds[0]!)
    await addCandidateSource(item.id, feeds[1]!)
    const topics = await Promise.all([createTestTopic(), createTestTopic()])
    for (const topic of topics)
      await addCategoryToRssFeedItem(item.id, topic.id, `candidate-${topic.id}`)
    const outsideBefore = await readCandidateFixture(outside.id, feeds)
    await setCandidatePublication(item.id, new Date(Date.now() - 60_000))
    await reconcileRssFeedItemCandidatePage(item.id)
    expect(await getCandidateReconciliation(item.id)).toMatchObject({
      phase: 'sources',
      cursor_feed_id: feeds.toSorted()[0],
    })
    const revisedDate = new Date(Date.now() - 120_000)
    await setCandidatePublication(item.id, revisedDate)
    expect(await getCandidateReconciliation(item.id)).toMatchObject({
      generation: '2',
      cursor_feed_id: null,
    })
    await reconcileRssFeedItemCandidatePage(item.id)
    const partial = await readCandidateFixture(item.id, feeds)
    expect(
      partial.sources.filter(row => row.item_sort_at?.getTime() === revisedDate.getTime()),
    ).toHaveLength(1)
    await reconcileRssFeedItemCandidatePage(item.id)
    await reconcileRssFeedItemCandidatePage(item.id)
    expect(await getCandidateReconciliation(item.id)).toMatchObject({
      phase: 'topics',
      cursor_topic_id: null,
    })
    await reconcileRssFeedItemCandidatePage(item.id)
    await reconcileRssFeedItemCandidatePage(item.id)
    expect(await reconcileRssFeedItemCandidatePage(item.id)).toBeNull()
    expect(await reconcileRssFeedItemCandidatePage(item.id)).toBeNull()
    const complete = await readCandidateFixture(item.id, feeds)
    expect(
      complete.sources.every(row => row.item_sort_at?.getTime() === revisedDate.getTime()),
    ).toBe(true)
    expect(complete.topics.every(row => row.sort_at?.getTime() === revisedDate.getTime())).toBe(
      true,
    )
    expect((await readCandidateFixture(outside.id, feeds)).candidate).toEqual(
      outsideBefore.candidate,
    )
    await setCandidateHidden(item.id)
    for (const phase of ['sources', 'sources', 'sources', 'topics', 'topics', 'topics']) {
      expect((await getCandidateReconciliation(item.id))!.phase).toBe(phase)
      await reconcileRssFeedItemCandidatePage(item.id)
    }
    expect(await getCandidateReconciliation(item.id)).toBeUndefined()
    const hidden = await readCandidateFixture(item.id, feeds)
    expect(hidden.sources.every(row => row.item_sort_at === null)).toBe(true)
    expect(hidden.topics.every(row => row.sort_at === null)).toBe(true)
  })
})

function uuidImmediatelyBefore(id: string): string {
  const previous = (BigInt(`0x${id.replaceAll('-', '')}`) - 1n).toString(16).padStart(32, '0')
  return [
    previous.slice(0, 8),
    previous.slice(8, 12),
    previous.slice(12, 16),
    previous.slice(16, 20),
    previous.slice(20),
  ].join('-')
}
