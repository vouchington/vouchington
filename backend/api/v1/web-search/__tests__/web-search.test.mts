import { describe, it, expect, beforeAll } from 'vitest'
import { randomBytes, randomUUID } from 'node:crypto'
import { createRequest } from '@voucha/api/test-helpers/server'
import {
  createTestUser,
  insertTestUrlHostname,
  insertTestUrl,
  insertTestCrawl,
  insertTestCrawlChunksBulk,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'

function sha256hex(): string {
  return randomBytes(32).toString('hex')
}

describe('GET /api/v1/web-search', () => {
  let authUser: PrivateUser

  beforeAll(async () => {
    authUser = await createTestUser()
  }, 60_000)

  it('anonymous: returns results, sets Cache-Control public, anon limit enforced', async () => {
    const token = randomUUID().replace(/-/g, '')
    const hostnameId = await insertTestUrlHostname({
      hostname: `api-ws-anon-${randomUUID()}.com`,
      crawlable: true,
    })
    const urlId = await insertTestUrl({
      url: `https://api-ws-anon-${randomUUID()}.com/page`,
      hostnameId,
    })
    const { id: crawlId } = await insertTestCrawl({
      urlId,
      statusCode: 200,
      markdown: `Anonymous test token ${token} content`,
    })
    await insertTestCrawlChunksBulk([
      {
        urlId,
        crawlId,
        orderIndex: 0,
        markdown: `Anonymous test token ${token} content`,
        contentSha256: sha256hex(),
      },
    ])

    const request = createRequest()
    const response = await request.get(`/api/v1/web-search?query=${token}`).expect(200)

    expect(response.headers['cache-control']).toMatch(/public/)
    expect(Array.isArray(response.body.results)).toBe(true)
    expect(response.body.page_info).toBeDefined()
    const match = response.body.results.find((r: { url: { id: string } }) => r.url.id === urlId)
    expect(match).toBeDefined()
  })

  it('authenticated: returns results without public Cache-Control', async () => {
    const token = randomUUID().replace(/-/g, '')
    const hostnameId = await insertTestUrlHostname({
      hostname: `api-ws-auth-${randomUUID()}.com`,
      crawlable: true,
    })
    const urlId = await insertTestUrl({
      url: `https://api-ws-auth-${randomUUID()}.com/page`,
      hostnameId,
    })
    const { id: crawlId } = await insertTestCrawl({
      urlId,
      statusCode: 200,
      markdown: `Auth test token ${token} content`,
    })
    await insertTestCrawlChunksBulk([
      {
        urlId,
        crawlId,
        orderIndex: 0,
        markdown: `Auth test token ${token} content`,
        contentSha256: sha256hex(),
      },
    ])

    const request = createRequest()
    await request.authenticateAs(authUser)
    const response = await request.get(`/api/v1/web-search?query=${token}`).expect(200)

    expect(response.headers['cache-control'] ?? '').not.toMatch(/public/)
    expect(Array.isArray(response.body.results)).toBe(true)
    const match = response.body.results.find((r: { url: { id: string } }) => r.url.id === urlId)
    expect(match).toBeDefined()
  })

  it('short query (<3 chars): returns 200 with empty results', async () => {
    const request = createRequest()
    const response = await request.get('/api/v1/web-search?query=ab').expect(200)

    expect(response.body.results).toEqual([])
    expect(response.body.page_info.has_next_page).toBe(false)
  })

  it('blocked hostname: excluded from results for anonymous users', async () => {
    const token = randomUUID().replace(/-/g, '')
    const blockedHostnameId = await insertTestUrlHostname({
      hostname: `api-ws-blocked-${randomUUID()}.com`,
      crawlable: true,
      blocked: true,
    })
    const urlId = await insertTestUrl({
      url: `https://api-ws-blocked-${randomUUID()}.com/${token}/page`,
      hostnameId: blockedHostnameId,
    })
    const { id: crawlId } = await insertTestCrawl({
      urlId,
      statusCode: 200,
      markdown: `Blocked ${token} content`,
    })
    await insertTestCrawlChunksBulk([
      {
        urlId,
        crawlId,
        orderIndex: 0,
        markdown: `Blocked ${token} content`,
        contentSha256: sha256hex(),
      },
    ])

    const request = createRequest()
    const response = await request.get(`/api/v1/web-search?query=${token}`).expect(200)

    expect(
      response.body.results.find((r: { url: { id: string } }) => r.url.id === urlId),
    ).toBeUndefined()
  })

  it('page_info.has_next_page is false', async () => {
    const token = randomUUID().replace(/-/g, '')
    const hostnameId = await insertTestUrlHostname({
      hostname: `api-ws-paging-${randomUUID()}.com`,
      crawlable: true,
    })
    await insertTestUrl({
      url: `https://api-ws-paging-${randomUUID()}.com/${token}/page`,
      hostnameId,
    })

    const request = createRequest()
    const response = await request.get(`/api/v1/web-search?query=${token}`).expect(200)

    expect(response.body.page_info.has_next_page).toBe(false)
  })
})
