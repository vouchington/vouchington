import { beforeAll, describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/api/test-helpers/server'
import {
  createTestMembership,
  createTestUser,
  insertTestCrawl,
  insertTestUrl,
  insertTestUrlHostname,
} from '@voucha/test-helpers'
import { decodeCursor, encodeCursor, encodeScopedUuidCursor } from '@modules/pagination'
import type { PrivateUser } from '@services/users/types'

describe('GET /api/v1/urls/:id/crawls cursor scope', () => {
  let paidUser: PrivateUser

  beforeAll(async () => {
    paidUser = await createTestUser()
    await createTestMembership({ user_id: paidUser.id, plan: 'pro' })
  }, 60_000)

  it('rejects a paid crawl cursor replayed against a different URL', async () => {
    const random = Math.random().toString(36).slice(2, 8)
    const firstHostnameId = await insertTestUrlHostname({
      hostname: `first-cursor-${random}.example.com`,
    })
    const secondHostnameId = await insertTestUrlHostname({
      hostname: `second-cursor-${random}.example.com`,
    })
    const firstUrlId = await insertTestUrl({
      url: `https://first-cursor-${random}.example.com/page`,
      hostnameId: firstHostnameId,
    })
    const secondUrlId = await insertTestUrl({
      url: `https://second-cursor-${random}.example.com/page`,
      hostnameId: secondHostnameId,
    })
    const { id: crawlId } = await insertTestCrawl({
      urlId: firstUrlId,
      statusCode: 200,
      markdown: '',
    })
    const request = createRequest()
    await request.authenticateAs(paidUser)

    const cursor = encodeScopedUuidCursor(crawlId, `url:${firstUrlId}:crawls`)
    const response = await request
      .get(`/api/v1/urls/${secondUrlId}/crawls?after=${encodeURIComponent(cursor)}`)
      .expect(400)

    expect(response.body.message).toBe('Invalid URL crawl cursor')
  })

  it('continues paid crawl history with a legacy URL cursor and emits a scoped cursor', async () => {
    const random = Math.random().toString(36).slice(2, 8)
    const hostnameId = await insertTestUrlHostname({
      hostname: `legacy-cursor-${random}.example.com`,
    })
    const urlId = await insertTestUrl({
      url: `https://legacy-cursor-${random}.example.com/page`,
      hostnameId,
    })
    await insertTestCrawl({ urlId, statusCode: 200, markdown: '' })
    await insertTestCrawl({ urlId, statusCode: 200, markdown: '' })
    const request = createRequest()
    await request.authenticateAs(paidUser)

    const firstResponse = await request.get(`/api/v1/urls/${urlId}/crawls?limit=1`).expect(200)
    const firstCrawlId = firstResponse.body.results[0]!.id as string
    expect(decodeCursor(firstResponse.body.page_info.end_cursor)).toEqual({
      id: firstCrawlId,
      scope: `url:${urlId}:crawls`,
    })

    const legacyCursor = encodeCursor({ id: firstCrawlId })
    const continuation = await request
      .get(`/api/v1/urls/${urlId}/crawls?limit=1&after=${encodeURIComponent(legacyCursor)}`)
      .expect(200)

    expect(continuation.body.results).toHaveLength(1)
    expect(continuation.body.results[0]!.id).not.toBe(firstCrawlId)
  })

  it('does not disclose another URL crawl when a legacy cursor is replayed', async () => {
    const random = Math.random().toString(36).slice(2, 8)
    const targetHostnameId = await insertTestUrlHostname({
      hostname: `legacy-target-${random}.example.com`,
    })
    const foreignHostnameId = await insertTestUrlHostname({
      hostname: `legacy-foreign-${random}.example.com`,
    })
    const targetUrlId = await insertTestUrl({
      url: `https://legacy-target-${random}.example.com/page`,
      hostnameId: targetHostnameId,
    })
    const foreignUrlId = await insertTestUrl({
      url: `https://legacy-foreign-${random}.example.com/page`,
      hostnameId: foreignHostnameId,
    })
    const firstTargetCrawl = await insertTestCrawl({
      urlId: targetUrlId,
      statusCode: 200,
      markdown: '',
    })
    const secondTargetCrawl = await insertTestCrawl({
      urlId: targetUrlId,
      statusCode: 200,
      markdown: '',
    })
    const foreignCrawl = await insertTestCrawl({
      urlId: foreignUrlId,
      statusCode: 200,
      markdown: '',
    })
    const request = createRequest()
    await request.authenticateAs(paidUser)

    const legacyCursor = encodeCursor({ id: foreignCrawl.id })
    const response = await request
      .get(`/api/v1/urls/${targetUrlId}/crawls?after=${encodeURIComponent(legacyCursor)}`)
      .expect(200)
    const resultIds = response.body.results.map((crawl: { id: string }) => crawl.id)

    expect(resultIds).toEqual(expect.arrayContaining([firstTargetCrawl.id, secondTargetCrawl.id]))
    expect(resultIds).not.toContain(foreignCrawl.id)
  })
})
