import { randomUUID } from 'node:crypto'
import { afterEach, beforeAll, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { relationLimitsConfig } from '@services/entity-relations/relation-limits'
import { getEntityRelationMetadataOrThrow } from '@services/entity-relations/metadata'
import { upsertEntityRelation } from '@services/entity-relations/upsert'
import { createPost } from '../create.mts'
import {
  CONTRIBUTING_USER_AGE_MS,
  createTestUserWithAge,
  getEntityRelation,
  WEB_PROVENANCE,
} from '@voucha/test-helpers'
import {
  createTestRedirectUrl,
  createTestUrlWithHostname,
} from '@voucha/test-helpers/entities/urls'
import { getTestPostCreationSourceUrlId } from '@voucha/test-helpers/entities/post-field-queries'
import { getUrlByAnyCached } from '@services/urls/get'
import * as crawlerEnqueues from '@queues/crawler/enqueues'
import { backgroundCpu as crawlUrls } from '@queues/background-cpu/queues'

const enqueueBulkCrawlUrls = crawlerEnqueues.enqueueBulkCrawlUrls
import type { PrivateUser } from '@services/users/types'
import '@services/referral-program-link-validations'
import '../register-post-related-urls-guard.mts'

describe('create.link-post-crawl', () => {
  let user: PrivateUser
  let ownedUrlIds: string[]

  beforeAll(async () => {
    user = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
  })

  beforeEach(() => {
    ownedUrlIds = []
    vi.spyOn(crawlerEnqueues, 'enqueueBulkCrawlUrls')
  })

  afterEach(async () => {
    const pendingEnqueues = vi
      .mocked(crawlerEnqueues.enqueueBulkCrawlUrls)
      .mock.results.flatMap(result =>
        result.type === 'return' && isPromiseLike(result.value) ? [result.value] : [],
      )
    await Promise.all(pendingEnqueues)
    await removeCrawlJobs(ownedUrlIds)
    vi.restoreAllMocks()
  })

  it('AC#1: enqueues a crawl job when a link post is created with a raw url string', async () => {
    const post = await createPost(user, WEB_PROVENANCE, {
      post_type: 'link',
      url: `https://example.com/${randomUUID()}`,
    })
    expect(post.url_id).toBeTruthy()
    ownedUrlIds.push(post.url_id!)

    expect(await crawledUrlIds(ownedUrlIds)).toContain(post.url_id)
  })

  it('AC#3: enqueues a crawl for the canonical URL when a redirect raw url is resolved', async () => {
    const canonicalUrlId = await createTestUrlWithHostname()
    const { urlString } = await createTestRedirectUrl({ canonicalUrlId })
    const sourceUrlId = (await getUrlByAnyCached(urlString))!.id
    ownedUrlIds.push(canonicalUrlId, sourceUrlId)

    const post = await createPost(user, WEB_PROVENANCE, {
      post_type: 'link',
      url: urlString,
    })

    expect(post.url_id).toBe(canonicalUrlId)
    await expect(getTestPostCreationSourceUrlId(post.id)).resolves.toBe(sourceUrlId)

    expect(await crawledUrlIds(ownedUrlIds)).toContain(canonicalUrlId)
  })

  it('counts the creation source URL against the related URL limit', async () => {
    await relationLimitsConfig.waitForInitialization()
    onTestFinished(
      overrideDynamicConfigFieldsForTest(relationLimitsConfig, { post_related_url: 1 }),
    )
    const canonicalUrlId = await createTestUrlWithHostname()
    const { urlString } = await createTestRedirectUrl({ canonicalUrlId })
    const sourceUrlId = (await getUrlByAnyCached(urlString))!.id
    const otherUrlId = await createTestUrlWithHostname()
    ownedUrlIds.push(canonicalUrlId, sourceUrlId, otherUrlId)
    const post = await createPost(user, WEB_PROVENANCE, { post_type: 'link', url: urlString })
    const relation = getEntityRelationMetadataOrThrow({
      subjectType: 'post',
      predicate: 'related',
      objectType: 'url',
    })
    expect(
      await getEntityRelation('relation__post__related__url', post.id, sourceUrlId),
    ).toHaveLength(1)
    await expect(
      upsertEntityRelation(user, relation, { id: post.id }, [{ id: otherUrlId }]),
    ).rejects.toMatchObject({ status: 409, code: 'RELATION_LIMIT_REACHED' })
  })

  it('AC#2: enqueues recovery crawl work for a link post created with a pre-existing url_id', async () => {
    const urlId = await createTestUrlWithHostname()
    ownedUrlIds.push(urlId)
    const crawled = watchRecoveryCrawl(urlId)

    const post = await createPost(user, WEB_PROVENANCE, {
      post_type: 'link',
      url_id: urlId,
    })
    await expect(getTestPostCreationSourceUrlId(post.id)).resolves.toBeNull()
    await crawled

    expect(await crawledUrlIds(ownedUrlIds)).toContain(urlId)
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

async function crawledUrlIds(urlIds: string[]): Promise<Array<string | undefined>> {
  await Promise.all(
    vi.mocked(crawlerEnqueues.enqueueBulkCrawlUrls).mock.results.map(result => result.value),
  )
  const jobs = await Promise.all(
    urlIds.map(url_id => crawlUrls.searchJobs({ name: 'crawl.crawl_url', data: { url_id } })),
  ).then(results => results.flat())
  return jobs.map(job => (job.data as { url_id?: string }).url_id)
}

async function removeCrawlJobs(urlIds: string[]): Promise<void> {
  const jobs = await Promise.all(
    urlIds.map(url_id => crawlUrls.searchJobs({ name: 'crawl.crawl_url', data: { url_id } })),
  )
  await Promise.all(jobs.flat().map(job => job.remove()))
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    'then' in value &&
    typeof value.then === 'function'
  )
}
