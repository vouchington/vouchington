import { afterEach, describe, it, expect } from 'vitest'
import { randomBytes, randomUUID } from 'node:crypto'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import {
  insertTestUrlHostname,
  insertTestUrl,
  insertTestCrawl,
  insertTestCrawlChunksBulk,
} from '@voucha/test-helpers'
import { webSearchConfig } from './config.mts'
import { searchWeb } from './search.mts'

describe('searchWeb paging', () => {
  it('single page: has_next_page false and no end_cursor', async () => {
    const token = searchToken()
    await seedMatch(token, 1)

    const result = await searchWeb({ query: token, limit: 10 })

    expect(result.page_info.has_next_page).toBe(false)
    expect(result.page_info.end_cursor).toBeNull()
  })

  describe('chunk cap', () => {
    let restore: (() => void) | undefined
    afterEach(() => restore?.())

    it('ranks only the capped chunk set; the dropped URL falls back to a url match', async () => {
      const token = searchToken()
      const strong = await seedMatch(token, 6)
      const medium = await seedMatch(token, 3)
      const weak = await seedMatch(token, 1)
      await webSearchConfig.waitForInitialization()
      restore = overrideDynamicConfigFieldsForTest(webSearchConfig, { chunk_cap: 2 })

      const result = await searchWeb({ query: token, limit: 25 })
      const byUrl = new Map(result.results.map(r => [r.url.id, r]))

      expect(byUrl.get(strong)?.match_type).toBe('content')
      expect(byUrl.get(medium)?.match_type).toBe('content')
      expect(byUrl.get(weak)).toMatchObject({ match_type: 'url', snippet: null })
      expect(result.results.map(r => r.url.id)).toEqual([strong, medium, weak])
    })
  })

  describe('cursor', () => {
    it('pages content matches, then url matches, without repeats', async () => {
      const token = searchToken()
      const first = await seedMatch(token, 4)
      const second = await seedMatch(token, 1)
      const urlOnly = await seedUrlOnly(token)

      const page1 = await searchWeb({ query: token, limit: 1 })
      expect(page1.results.map(r => r.url.id)).toEqual([first])
      expect(page1.page_info.has_next_page).toBe(true)

      const page2 = await searchWeb({ query: token, limit: 1, after: page1.page_info.end_cursor! })
      expect(page2.results.map(r => r.url.id)).toEqual([second])
      expect(page2.page_info.has_next_page).toBe(true)

      const page3 = await searchWeb({ query: token, limit: 1, after: page2.page_info.end_cursor! })
      expect(page3.results.map(r => [r.url.id, r.match_type])).toEqual([[urlOnly, 'url']])
      expect(page3.page_info.has_next_page).toBe(false)
      expect(page3.page_info.end_cursor).toBeNull()
    })

    it('continues inside the url tier from a url cursor, newest url first', async () => {
      const token = searchToken()
      const older = await seedUrlOnly(token)
      const newer = await seedUrlOnly(token)

      const page1 = await searchWeb({ query: token, limit: 1 })
      expect(page1.results.map(r => r.url.id)).toEqual([newer])
      expect(page1.page_info.has_next_page).toBe(true)

      const page2 = await searchWeb({ query: token, limit: 1, after: page1.page_info.end_cursor! })
      expect(page2.results.map(r => r.url.id)).toEqual([older])
      expect(page2.page_info.has_next_page).toBe(false)
    })

    it('rejects malformed, empty, and foreign-query cursors with 400', async () => {
      const token = searchToken()
      await seedMatch(token, 2)
      await seedMatch(token, 1)
      const other = searchToken()
      await seedMatch(other, 2)
      await seedMatch(other, 1)
      const foreign = await searchWeb({ query: other, limit: 1 })

      for (const after of ['not-a-cursor', '', foreign.page_info.end_cursor!]) {
        await expect(searchWeb({ query: token, limit: 1, after })).rejects.toMatchObject({
          status: 400,
        })
      }
    })
  })
})

async function seedMatch(token: string, repeats: number): Promise<string> {
  const urlId = await seedUrlOnly(token)
  const markdown = `${Array.from({ length: repeats }, () => token).join(' ')} body text`
  const { id: crawlId } = await insertTestCrawl({ urlId, statusCode: 200, markdown })
  await insertTestCrawlChunksBulk([
    { urlId, crawlId, orderIndex: 0, markdown, contentSha256: randomBytes(32).toString('hex') },
  ])
  return urlId
}

async function seedUrlOnly(token: string): Promise<string> {
  const hostnameId = await insertTestUrlHostname({
    hostname: `web-search-page-${randomUUID()}.com`,
    is_crawlable: true,
  })
  return insertTestUrl({
    url: `https://web-search-page-${randomUUID()}.com/${token}/page`,
    hostnameId,
  })
}

// Letters only: a hex token containing digits can parse into several lexemes (for example an
// exponent-like run), which makes ts_rank order repeat counts unpredictably.
function searchToken(): string {
  return randomUUID()
    .replace(/-/g, '')
    .replace(/\d/g, d => 'ghijklmnop'[Number(d)]!)
}
