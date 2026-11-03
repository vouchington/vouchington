import { afterEach, describe, expect, it, vi } from 'vitest'
import * as contentAnalysisEnqueues from '@queues/content-analysis/enqueues'
import { upsertRssFeedItems } from '../upsert.mts'
import { insertTestRssFeedDirect } from '@voucha/test-helpers'

describe('upsertRssFeedItems language redetection', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('queues an unchanged item once only when redetectLanguage is set', async () => {
    const feed = await insertTestRssFeedDirect({})
    const item = {
      guid: `language-redetect-${crypto.randomUUID()}`,
      link: `https://example.com/language-redetect-${crypto.randomUUID()}`,
      title: 'Unchanged item',
    }
    const [created] = await upsertRssFeedItems(feed.id, [item])
    const spy = vi.spyOn(contentAnalysisEnqueues, 'enqueueBulkLanguageDetection')

    await upsertRssFeedItems(feed.id, [item], { redetectLanguage: false })
    expect(spy).not.toHaveBeenCalled()

    await upsertRssFeedItems(feed.id, [item], { redetectLanguage: true })
    expect(spy).toHaveBeenCalledOnce()
    expect(spy).toHaveBeenCalledWith('rss_feed_item', [created.id])
  })
})
