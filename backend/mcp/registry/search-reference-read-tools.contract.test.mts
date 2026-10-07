import { randomBytes, randomUUID } from 'node:crypto'
import {
  createTestUser,
  insertTestCrawl,
  insertTestCrawlChunksBulk,
  insertTestUrl,
  insertTestUrlHostname,
} from '@voucha/test-helpers'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  callStructuredMcpTool,
  type McpContractCaller,
} from '@voucha/test-helpers/mcp-tool-contract'
import { beforeAll, describe, expect, it } from 'vitest'

type Body = Record<string, unknown>
type WebResult = {
  url: { id: string; url: string; hostname: Body | null }
  snippet: string | null
  match_type: 'content' | 'url'
}
type WebPage = {
  success: true
  results: WebResult[]
  page_info: Body
}

const INVALID_CURSOR = { success: false, error: 'Invalid cursor' }

const asCaller = (user: Awaited<ReturnType<typeof createTestUser>>): McpContractCaller => ({
  ...user,
  membership_plan: null,
})
const reference = (caller: McpContractCaller, name: string, args: Body = {}) =>
  callStructuredMcpTool(caller, name, args, ['reference-data:read'])

describe('search_web — real DB', () => {
  const token = randomUUID().replaceAll('-', '')
  let caller: McpContractCaller
  let contentHost: string
  let contentUrlId: string
  let urlOnlyUrlId: string
  let blockedUrlId: string

  const search = (args: Body) =>
    callStructuredMcpTool(caller, 'search_web', args, ['web-search:read']) as Promise<WebPage>

  async function crawledPage(host: string, path: string, options: { blocked?: boolean } = {}) {
    const hostnameId = await insertTestUrlHostname({
      hostname: host,
      is_crawlable: true,
      is_blocked: options.blocked,
    })
    const urlId = await insertTestUrl({ url: `https://${host}${path}`, hostnameId })
    return { hostnameId, urlId }
  }

  beforeAll(async () => {
    caller = asCaller(await createTestUser())
    contentHost = `web-search-content-${token}.example.com`
    const content = await crawledPage(contentHost, '/page')
    contentUrlId = content.urlId
    const markdown = `The sentinel word ${token} appears in this crawled page for the search tool`
    const { id: crawlId } = await insertTestCrawl({
      urlId: contentUrlId,
      statusCode: 200,
      markdown,
    })
    await insertTestCrawlChunksBulk([
      {
        urlId: contentUrlId,
        crawlId,
        orderIndex: 0,
        markdown,
        contentSha256: randomBytes(32).toString('hex'),
      },
    ])
    urlOnlyUrlId = (await crawledPage(`web-search-url-${token}.example.com`, `/${token}/page`))
      .urlId
    blockedUrlId = (
      await crawledPage(`web-search-blocked-${token}.example.com`, `/${token}/page`, {
        blocked: true,
      })
    ).urlId
  })

  it('returns a crawled page with its public hostname and a fenced snippet', async () => {
    const { results } = await search({ query: `sentinel ${token}` })
    const match = results.find(result => result.url.id === contentUrlId)!

    expect(match.match_type).toBe('content')
    expect(match.url.url).toBe(`https://${contentHost}/page`)
    expect(Object.keys(match.url.hostname!).toSorted()).toEqual(['hostname', 'id', 'topic_id'])
    expect(match.url.hostname).toMatchObject({ hostname: contentHost, topic_id: null })
    // The snippet is text from another website: it comes back fenced, never as bare text.
    // Highlighting may split a hex token at digit/letter boundaries, so compare the unmarked text.
    expect(match.snippet!.replaceAll(/⟦\/?MARK⟧/g, '')).toContain(token)
    expect(match.snippet).toMatch(
      /^<external-content source="web_search"[\s\S]*<\/external-content>/,
    )
  })

  it('matches a url alone with no snippet, and never lists a blocked hostname', async () => {
    const { results } = await search({ query: token })

    expect(results.find(result => result.url.id === urlOnlyUrlId)).toMatchObject({
      match_type: 'url',
      snippet: null,
    })
    expect(results.map(result => result.url.id)).not.toContain(blockedUrlId)
  })

  it('returns the same pages in the same order as signed-out REST', async () => {
    const rest = await createRequest().get(`/api/v1/web-search?query=${token}`).expect(200)

    const { results, page_info } = await search({ query: token })

    expect(results.map(result => result.url.id)).toEqual(
      rest.body.results.map((result: { url: { id: string } }) => result.url.id),
    )
    expect(page_info).toEqual(rest.body.page_info)
  })

  it('returns no more than the limit, and one page without a cursor', async () => {
    const { results, page_info } = await search({ query: token, limit: 1 })

    expect(results).toHaveLength(1)
    expect(page_info).toMatchObject({ has_next_page: false })
  })

  it('gives a query under three characters no results, like REST', async () => {
    const rest = await createRequest().get('/api/v1/web-search?query=ab').expect(200)

    for (const query of ['ab', '  a  ', '']) {
      expect(await search({ query })).toEqual({ success: true, ...rest.body })
    }
  })
})

describe('list_countries, list_currencies and get_platform_stats — real DB', () => {
  let caller: McpContractCaller

  beforeAll(async () => {
    caller = asCaller(await createTestUser())
  })

  it('list_countries returns the fixed list REST returns', async () => {
    const rest = await createRequest().get('/api/v1/countries').expect(200)

    const result = await reference(caller, 'list_countries')

    expect(result).toEqual({ success: true, results: rest.body.results })
    expect(result['results']).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'US' })]),
    )
  })

  it('list_currencies returns the seeded currencies by code, like REST', async () => {
    const rest = await createRequest().get('/api/v1/currencies').expect(200)

    const result = await reference(caller, 'list_currencies')

    expect(result).toEqual({ success: true, ...rest.body })
    expect((result['results'] as Body[]).map(currency => currency['code'])).toEqual([
      'aud',
      'cad',
      'eur',
      'gbp',
      'jpy',
      'usd',
    ])
  })

  it('list_currencies pages by cursor like REST and refuses a malformed one', async () => {
    const first = await reference(caller, 'list_currencies', { limit: 4 })
    const cursor = (first['page_info'] as Body)['end_cursor']
    const second = await reference(caller, 'list_currencies', { limit: 4, after: cursor })
    const rest = await createRequest().get(`/api/v1/currencies?limit=4&after=${cursor}`).expect(200)

    expect((first['results'] as Body[]).map(currency => currency['code'])).toEqual([
      'aud',
      'cad',
      'eur',
      'gbp',
    ])
    expect((first['page_info'] as Body)['has_next_page']).toBe(true)
    expect(second).toEqual({ success: true, ...rest.body })
    for (const after of ['not-a-cursor', 'bm9wZQ']) {
      expect(await reference(caller, 'list_currencies', { after })).toEqual(INVALID_CURSOR)
    }
  })

  it('get_platform_stats returns the six counts REST returns', async () => {
    const rest = await createRequest().get('/api/v1/platform-stats').expect(200)

    const { success, ...counts } = await reference(caller, 'get_platform_stats')

    expect(success).toBe(true)
    expect(Object.keys(counts).toSorted()).toEqual(Object.keys(rest.body).toSorted())
    for (const count of Object.values(counts)) {
      expect(Number.isInteger(count)).toBe(true)
      expect(count).toBeGreaterThanOrEqual(0)
    }
  })
})
