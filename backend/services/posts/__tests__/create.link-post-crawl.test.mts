import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPost } from '../create.mts'
import {
  CONTRIBUTING_USER_AGE_MS,
  createTestUserWithAge,
  readAllQueueJobs,
  WEB_PROVENANCE,
} from '@voucha/test-helpers'
import {
  createTestRedirectUrl,
  createTestUrlWithHostname,
} from '@voucha/test-helpers/entities/urls'
import { getTestPostCreationSourceUrlId } from '@voucha/test-helpers/entities/post-field-queries'
import { getUrlByAny } from '@services/urls/get'
import * as crawlerEnqueues from '@queues/crawler/enqueues'
import { crawlUrls } from '@queues/crawler/queues'

const enqueueBulkCrawlUrls = crawlerEnqueues.enqueueBulkCrawlUrls
import type { PrivateUser } from '@services/users/types'
import '@services/referral-program-link-validations'
import '../register-post-related-urls-guard.mts'

describe('create.link-post-crawl', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
  })

  beforeEach(async () => {
    await crawlUrls.obliterate()
    vi.spyOn(crawlerEnqueues, 'enqueueBulkCrawlUrls')
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('AC#1: enqueues a crawl job when a link post is created with a raw url string', async () => {
    const post = await createPost(user, WEB_PROVENANCE, {
      post_type: 'link',
      url: 'https://example.com/',
    })
    expect(post.url_id).toBeTruthy()

    expect(await crawledUrlIds()).toContain(post.url_id)
  })

  it('AC#3: enqueues a crawl for the canonical URL when a redirect raw url is resolved', async () => {
    const canonicalUrlId = await createTestUrlWithHostname()
    const { urlString } = await createTestRedirectUrl({ canonicalUrlId })
    const sourceUrlId = (await getUrlByAny(urlString))!.id

    const post = await createPost(user, WEB_PROVENANCE, {
      post_type: 'link',
      url: urlString,
    })

    expect(post.url_id).toBe(canonicalUrlId)
    await expect(getTestPostCreationSourceUrlId(post.id)).resolves.toBe(sourceUrlId)

    expect(await crawledUrlIds()).toContain(canonicalUrlId)
  })

  it('AC#2: enqueues recovery crawl work for a link post created with a pre-existing url_id', async () => {
    const urlId = await createTestUrlWithHostname()
    await crawlUrls.obliterate()
    const crawled = watchRecoveryCrawl(urlId)

    const post = await createPost(user, WEB_PROVENANCE, {
      post_type: 'link',
      url_id: urlId,
    })
    await expect(getTestPostCreationSourceUrlId(post.id)).resolves.toBeNull()
    await crawled

    expect(await crawledUrlIds()).toContain(urlId)
  })
})

function watchRecoveryCrawl(urlId: string): Promise<void> {
  const crawled = Promise.withResolvers<void>()
  vi.spyOn(crawlerEnqueues, 'enqueueBulkCrawlUrls').mockImplementation(async (entries, options) => {
    const result = await enqueueBulkCrawlUrls(entries, options)
    if (entries.some(entry => entry.urlId === urlId)) crawled.resolve()
    return result
  })
  return crawled.promise
}

async function crawledUrlIds(): Promise<Array<string | undefined>> {
  await Promise.all(
    vi.mocked(crawlerEnqueues.enqueueBulkCrawlUrls).mock.results.map(result => result.value),
  )
  const jobs = await readAllQueueJobs(crawlUrls)
  return jobs.map(job => (job.data as { url_id?: string }).url_id)
}
