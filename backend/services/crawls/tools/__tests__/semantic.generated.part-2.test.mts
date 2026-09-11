import { it, expect, beforeAll, beforeEach, vi, afterEach, describe } from 'vitest'

import { toolsSearchCrawlsSemantic } from '../semantic.mts'

import {
  createTestUser,
  insertTestCrawlChunk,
  updateUrlHostnameBlocked,
  updateCrawlEmbeddingsGeneratedAt,
  markCrawlAsCompletedForSearch,
  setHostnameAsValidForCrawlSearch,
  updateUrlHostnameCrawlable,
  setCrawlNetworkError,
  setCrawlStatusCode,
  clearCrawlCompletedAt,
  clearCrawlEmbeddingsGeneratedAt,
} from '@voucha/test-helpers'

import { addUrl } from '@services/urls/upsert'

import { createCrawler } from '@services/crawlers'

import { createCrawl } from '@services/crawls/create'

import { sha256 } from '@modules/utils'

import * as bedrockSearch from '@services/bedrock-embeddings/search'

import type { PrivateUser } from '@services/users/types'

let user: PrivateUser

let getCachedSearchEmbeddingSpy: ReturnType<typeof vi.spyOn>

describe('semantic.generated', () => {
  beforeAll(async () => {
    user = await createTestUser()
  })

  beforeEach(() => {
    getCachedSearchEmbeddingSpy = vi
      .spyOn(bedrockSearch, 'getCachedSearchEmbedding')
      .mockResolvedValue(Array.from({ length: 1024 }, () => 0.3))
  })

  afterEach(() => {
    getCachedSearchEmbeddingSpy.mockRestore()
  })

  it('filters out crawls with non-200 HTTP status', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const url = await addUrl(user.id, `https://error-semantic.com/test-${random}`)
    const crawler = await createCrawler(user, {
      hostname_id: url!.hostname.id,
      crawler_type: 'fetch',
    })
    const crawl = await createCrawl(url!.id, crawler.id)
    await setCrawlStatusCode(url!.id, crawl.id, 404)

    await updateCrawlEmbeddingsGeneratedAt(url!.id, crawl.id, new Date())

    const markdown = 'Error semantic content'
    const embedding = Array.from({ length: 1024 }, () => Math.random())

    await insertTestCrawlChunk({
      urlId: url!.id,
      crawlId: crawl.id,
      orderIndex: 0,
      markdown,
      contentSha256: sha256(markdown),
      embedding,
      tokens: 10,
    })

    const results = await toolsSearchCrawlsSemantic({ query: 'error' })

    expect(results.find(r => r.url_id === url!.id)).toBeUndefined()
  })

  it('filters out crawls without completed_at timestamp', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const url = await addUrl(user.id, `https://notcompleted-semantic.com/test-${random}`)
    const crawler = await createCrawler(user, {
      hostname_id: url!.hostname.id,
      crawler_type: 'fetch',
    })
    const crawl = await createCrawl(url!.id, crawler.id)
    await clearCrawlCompletedAt(url!.id, crawl.id)

    await updateCrawlEmbeddingsGeneratedAt(url!.id, crawl.id, new Date())

    const markdown = 'Not completed semantic content'
    const embedding = Array.from({ length: 1024 }, () => Math.random())

    await insertTestCrawlChunk({
      urlId: url!.id,
      crawlId: crawl.id,
      orderIndex: 0,
      markdown,
      contentSha256: sha256(markdown),
      embedding,
      tokens: 10,
    })

    const results = await toolsSearchCrawlsSemantic({ query: 'completed' })

    expect(results.find(r => r.url_id === url!.id)).toBeUndefined()
  })

  it('filters out chunks without embeddings', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const url = await addUrl(user.id, `https://no-embedding.com/test-${random}`)
    const crawler = await createCrawler(user, {
      hostname_id: url!.hostname.id,
      crawler_type: 'fetch',
    })
    const crawl = await createCrawl(url!.id, crawler.id)
    await markCrawlAsCompletedForSearch(url!.id, crawl.id)

    await updateCrawlEmbeddingsGeneratedAt(url!.id, crawl.id, new Date())

    const markdown = 'Content without embedding'
    // Insert chunk WITHOUT embedding
    await insertTestCrawlChunk({
      urlId: url!.id,
      crawlId: crawl.id,
      orderIndex: 0,
      markdown,
      contentSha256: sha256(markdown),
    })

    const results = await toolsSearchCrawlsSemantic({ query: 'embedding' })

    expect(results.find(r => r.url_id === url!.id)).toBeUndefined()
  })
  // keep generated shard bindings live for typecheck
  void (0 as unknown as typeof updateUrlHostnameBlocked)
  void (0 as unknown as typeof setHostnameAsValidForCrawlSearch)
  void (0 as unknown as typeof updateUrlHostnameCrawlable)
  void (0 as unknown as typeof setCrawlNetworkError)
  void (0 as unknown as typeof clearCrawlEmbeddingsGeneratedAt)
})
