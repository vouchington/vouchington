import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createPost } from '../create.mts'
import {
  CONTRIBUTING_USER_AGE_MS,
  createTestUserWithAge,
  waitForQueueJobs,
  WEB_PROVENANCE,
} from '@voucha/test-helpers'
import {
  createTestRedirectUrl,
  createTestUrlWithHostname,
} from '@voucha/test-helpers/entities/urls'
import { getTestPostCreationSourceUrlId } from '@voucha/test-helpers/entities/post-field-queries'
import { getUrlByAny } from '@services/urls/get'
import { crawlUrls } from '@queues/crawler/queues'
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
  })

  it('AC#1: enqueues a crawl job when a link post is created with a raw url string', async () => {
    const post = await createPost(WEB_PROVENANCE, user, {
      post_type: 'link',
      url: 'https://example.com/',
    })
    expect(post.url_id).toBeTruthy()

    const jobs = await waitForQueueJobs(
      crawlUrls,
      j => j.some(job => (job.data as { url_id: string }).url_id === post.url_id),
      2000,
    )
    expect(jobs.some(j => (j.data as { url_id: string }).url_id === post.url_id)).toBe(true)
  })

  it('AC#3: enqueues a crawl for the canonical URL when a redirect raw url is resolved', async () => {
    const canonicalUrlId = await createTestUrlWithHostname()
    const { urlString } = await createTestRedirectUrl({ canonicalUrlId })
    const sourceUrlId = (await getUrlByAny(urlString))!.id

    const post = await createPost(WEB_PROVENANCE, user, {
      post_type: 'link',
      url: urlString,
    })

    expect(post.url_id).toBe(canonicalUrlId)
    await expect(getTestPostCreationSourceUrlId(post.id)).resolves.toBe(sourceUrlId)

    const jobs = await waitForQueueJobs(
      crawlUrls,
      j => j.some(job => (job.data as { url_id: string }).url_id === canonicalUrlId),
      2000,
    )
    expect(jobs.some(j => (j.data as { url_id: string }).url_id === canonicalUrlId)).toBe(true)
  })

  it('AC#2: enqueues recovery crawl work for a link post created with a pre-existing url_id', async () => {
    const urlId = await createTestUrlWithHostname()
    await crawlUrls.obliterate()

    const post = await createPost(WEB_PROVENANCE, user, {
      post_type: 'link',
      url_id: urlId,
    })
    await expect(getTestPostCreationSourceUrlId(post.id)).resolves.toBeNull()

    const jobs = await waitForQueueJobs(
      crawlUrls,
      j => j.some(job => (job.data as { url_id: string }).url_id === urlId),
      2000,
    )
    expect(jobs.some(j => (j.data as { url_id: string }).url_id === urlId)).toBe(true)
  })
})
