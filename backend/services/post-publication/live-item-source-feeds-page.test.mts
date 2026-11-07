import { describe, expect, it, onTestFinished } from 'vitest'
import {
  addRssFeedItemSource,
  createTestRssFeedItemWithUrl,
  insertTestRssFeedDirect,
} from '@voucha/test-helpers'
import { softDeleteLocalRssFeeds } from '../../test-helpers/data-stores/psql/rss-feeds.mts'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { postPublicationWorkConfig } from './work-limits.mts'
import { listLiveItemSourceFeedsPage } from './live-topic-merge-pages.mts'

describe('live item source feed pages', () => {
  it('continues past a deleted source feed without skipping the next live feed', async () => {
    onTestFinished(
      overrideDynamicConfigFieldsForTest(postPublicationWorkConfig, { capture_batch_size: 1 }),
    )
    const feeds = []
    for (const title of ['before', 'deleted', 'after']) {
      feeds.push(await insertTestRssFeedDirect({ title: `${title}-${crypto.randomUUID()}` }))
    }
    const item = await createTestRssFeedItemWithUrl(feeds[0]!.id)
    await addRssFeedItemSource(feeds[1]!.id, item.id)
    await addRssFeedItemSource(feeds[2]!.id, item.id)
    await softDeleteLocalRssFeeds([feeds[1]!.id])

    const seen: string[] = []
    let after: string | null = null
    let continuationWasFull = true
    for (let step = 0; step < 8; step++) {
      const page = await listLiveItemSourceFeedsPage(item.id, after)
      seen.push(...page.ids)
      if (page.cursor && page.ids.length !== 1) continuationWasFull = false
      if (!page.cursor) break
      after = page.cursor
    }

    expect(seen).toEqual([feeds[0]!.id, feeds[2]!.id].toSorted())
    expect(continuationWasFull).toBe(true)
  })
})
