import { randomUUID } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { getFirstRssFeedImportRowId } from '@voucha/test-helpers/rss-feed-import-rows'
import {
  createTestTopic,
  createTestUser,
  insertTestRssFeedDirect,
  mergeTopicForTest,
  WEB_PROVENANCE,
} from '@voucha/test-helpers'
import {
  getRssFeedImport,
  processRssFeedImportRow,
  submitRssFeedImport,
} from './rss-feed-imports.mts'

describe('RSS feed import status for a merged feed topic', () => {
  it('resolves the slug of the topic that replaced it', async () => {
    const user = await createTestUser()
    const source = await createTestTopic({ slug: `merged-import-source-${randomUUID()}` })
    const target = await createTestTopic({ slug: `merged-import-target-${randomUUID()}` })
    const rssFeed = await insertTestRssFeedDirect({ topicId: source.id })
    await mergeTopicForTest(source.id, target.id, user.id)
    const created = await submitRssFeedImport(user, WEB_PROVENANCE, [
      `https://merged-import-${Date.now()}.example.com/feed.xml`,
    ])

    await processRssFeedImportRow(
      created.import.id,
      await getFirstRssFeedImportRowId(created.import.id),
      {
        createSourceFromUrlImpl: vi.fn<(...args: any[]) => Promise<any>>().mockResolvedValue({
          status: 'created',
          topic_slug: source.slug,
          topic_id: source.id,
          rss_feed_id: rssFeed.id,
        }),
      },
    )

    const status = await getRssFeedImport(user.id, created.import.id)
    expect(status?.rows[0]).toMatchObject({ entity_id: rssFeed.id, topic_slug: target.slug })
  })
})
