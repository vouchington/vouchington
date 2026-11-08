import { describe, expect, it, onTestFinished } from 'vitest'
import {
  createTestTopic,
  insertTestRssFeedDirect,
  overrideDynamicConfigFieldsForTest,
} from '@voucha/test-helpers'
import { listTopicPublicationFeedsPage } from './topic-feed-pages.mts'
import { postPublicationWorkConfig } from './work-limits.mts'

describe('topic publication feed pages', () => {
  it('walks one supplied topic set using topic ids as the cursor', async () => {
    await postPublicationWorkConfig.waitForInitialization()
    const restore = overrideDynamicConfigFieldsForTest(postPublicationWorkConfig, {
      capture_batch_size: 1,
    })
    onTestFinished(restore)
    const topics = await Promise.all(
      Array.from({ length: 4 }, () =>
        createTestTopic({ hostname: `feed-page-${crypto.randomUUID()}.example.com` }),
      ),
    )
    const feeds = await Promise.all(
      topics.map(topic => insertTestRssFeedDirect({ topicId: topic.id })),
    )
    const selected = topics
      .slice(0, 3)
      .map((topic, index) => ({ topicId: topic.id, feedId: feeds[index]!.id }))
      .toSorted((a, b) => a.topicId.localeCompare(b.topicId))
    const ids = selected.map(row => row.topicId).toReversed()
    const first = await listTopicPublicationFeedsPage(ids, null)
    const second = await listTopicPublicationFeedsPage(ids, first.cursor)
    const third = await listTopicPublicationFeedsPage(ids, second.cursor)
    expect(first).toEqual({
      ids: [selected[0]!.feedId],
      hasMore: true,
      cursor: selected[0]!.topicId,
    })
    expect(second).toEqual({
      ids: [selected[1]!.feedId],
      hasMore: true,
      cursor: selected[1]!.topicId,
    })
    expect(third).toEqual({ ids: [selected[2]!.feedId], hasMore: false, cursor: null })
  })
})
