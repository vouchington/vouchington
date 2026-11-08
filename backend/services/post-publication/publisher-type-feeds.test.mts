import { randomUUID } from 'node:crypto'
import { describe, expect, it, onTestFinished } from 'vitest'
import { insertTestRssFeedDirect } from '@voucha/test-helpers/entities/rss-feeds'
import { createTestTopic, overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers'
import { postPublicationWorkConfig } from './work-limits.mts'
import { listPublisherTypeFeedPublicationPage } from './publisher-type-feeds.mts'

describe('publisher-type feed publication continuation', () => {
  it('pages immutable topic IDs past absent feeds without scanning historical rows', async () => {
    const first = await createTestTopic()
    const second = await createTestTopic()
    const firstFeed = await insertTestRssFeedDirect({ topicId: first.id })
    const secondFeed = await insertTestRssFeedDirect({ topicId: second.id })
    const ids = [first.id, second.id, randomUUID()].toSorted()
    onTestFinished(
      overrideDynamicConfigFieldsForTest(postPublicationWorkConfig, { capture_batch_size: 1 }),
    )
    const pages = []
    let cursor: string | null = null
    for (const topicId of ids) {
      const page = await listPublisherTypeFeedPublicationPage(ids, cursor)
      expect(page.cursor).toBe(page.hasMore ? topicId : null)
      pages.push(page)
      cursor = page.cursor
    }
    expect(pages.map(page => page.rowsRead)).toEqual([1, 1, 1])
    expect(pages.map(page => page.hasMore)).toEqual([true, true, false])
    expect(pages.flatMap(page => page.rssFeedIds).toSorted()).toEqual(
      [firstFeed.id, secondFeed.id].toSorted(),
    )
    expect(cursor).toBeNull()
  })
})
