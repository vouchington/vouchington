import { describe, expect, it } from 'vitest'
import { language_detection } from '@queues/language-detection/queues'
import { addUrl } from '@services/urls/upsert'
import { createCrawler } from '@services/crawlers'
import { createCrawl } from '../create.mts'
import { updateCrawl } from '../update.mts'
import { createTestUser, readAllQueueJobs } from '@voucha/test-helpers'

describe('updateCrawl language detection enqueueing', () => {
  it('enqueues language detection when detector input is cleared', async () => {
    const user = await createTestUser({ administrator: true })
    const random = Math.random().toString(36).slice(2, 15)
    const url = await addUrl(user.id, `https://example.com/update-crawl-lang-clear-${random}`)
    const crawler = await createCrawler(user, {
      hostname_id: url!.hostname.id,
      crawler_type: 'fetch',
    })
    const crawl = await createCrawl(url!.id, crawler.id)

    await updateCrawl(crawl.id, url!.id, { lang: null })

    await expect
      .poll(async () => {
        const jobs = await readAllQueueJobs(language_detection)
        return jobs.some(
          job => job.name === 'crawl' && (job.data as { id?: string }).id === crawl.id,
        )
      })
      .toBe(true)
  })
})
