import { describe, it, expect, afterAll, beforeAll } from 'vitest'
import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs'

describe('rss-feed-processing analytics', () => {
  let testDir: string
  let originalAnalyticsLocalDir: string | undefined
  let originalAnalyticsBackend: string | undefined
  let flush: typeof import('@data-stores/analytics/backend-local').flush
  let getPartitionPath: typeof import('@data-stores/analytics/backend-local').getPartitionPath
  let trackRssFeedProcessingTruncated: typeof import('./rss-feed-processing.mts').trackRssFeedProcessingTruncated

  beforeAll(async () => {
    originalAnalyticsLocalDir = process.env.ANALYTICS_LOCAL_DIR
    originalAnalyticsBackend = process.env.ANALYTICS_BACKEND
    testDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'analytics-rss-feed-test-'))
    process.env.ANALYTICS_LOCAL_DIR = testDir
    process.env.ANALYTICS_BACKEND = 'local'
    ;({ flush, getPartitionPath } = await import('@data-stores/analytics/backend-local'))
    ;({ trackRssFeedProcessingTruncated } = await import('./rss-feed-processing.mts'))
  })

  afterAll(async () => {
    await fs.promises.rm(testDir, { recursive: true })
    if (originalAnalyticsLocalDir === undefined) {
      delete process.env.ANALYTICS_LOCAL_DIR
    } else {
      process.env.ANALYTICS_LOCAL_DIR = originalAnalyticsLocalDir
    }
    if (originalAnalyticsBackend === undefined) {
      delete process.env.ANALYTICS_BACKEND
    } else {
      process.env.ANALYTICS_BACKEND = originalAnalyticsBackend
    }
  })

  it('records RSS feed truncation counts', async () => {
    const rssFeedId = crypto.randomUUID()

    trackRssFeedProcessingTruncated({
      rssFeedId,
      totalParsedItems: 600,
      validItemsBeforeCap: 550,
      returnedItems: 500,
      itemCap: 500,
      itemTruncatedCount: 50,
      categoryCap: 20,
      categoryTruncatedItemCount: 3,
      categoryTruncatedCount: 12,
    })
    await flush()

    const eventDate = new Date().toISOString().slice(0, 10)
    const rows = (
      await fs.promises.readFile(getPartitionPath('rss_feed_processing', eventDate), 'utf8')
    )
      .trim()
      .split('\n')
      .flatMap(line => {
        const row = JSON.parse(line) as Record<string, unknown>
        return row.rss_feed_id === rssFeedId ? [row] : []
      })
    expect(rows).toHaveLength(1)
    expect(rows[0]!.event_type).toBe('truncated')
    expect(rows[0]!.event_id).toEqual(expect.any(String))
    expect(rows[0]!.event_date).toBe(eventDate)
    expect(rows[0]!.env).toBe(process.env.NODE_ENV)
    expect(Number(rows[0]!.total_parsed_items)).toBe(600)
    expect(Number(rows[0]!.valid_items_before_cap)).toBe(550)
    expect(Number(rows[0]!.returned_items)).toBe(500)
    expect(Number(rows[0]!.item_truncated_count)).toBe(50)
    expect(Number(rows[0]!.category_truncated_item_count)).toBe(3)
    expect(Number(rows[0]!.category_truncated_count)).toBe(12)
  })
})
