import { describe, expect, it } from 'vitest'
import { createTestTopic, insertTestRssFeedDirect } from '@voucha/test-helpers'
import { searchRssFeeds } from '../search.mts'

// Punctuation produces no full-text terms, isolating the title fallback without matching global fixtures.
describe('literal RSS title search', () => {
  it.each(['%', '_', '\\'])('treats %s literally in title matching', async symbol => {
    const [literalTopic, otherTopic] = await Promise.all([createTestTopic(), createTestTopic()])
    const literal = await insertTestRssFeedDirect({
      topicId: literalTopic.id,
      title: `Literal ${symbol} title`,
    })
    await insertTestRssFeedDirect({ topicId: otherTopic.id, title: 'Literal ordinary title' })
    const feeds = await searchRssFeeds({
      topic_ids: [literalTopic.id, otherTopic.id],
      text_search_query: symbol,
      is_enabled: null,
    })
    expect(feeds.map(feed => feed.id)).toEqual([literal.id])
  })
})
