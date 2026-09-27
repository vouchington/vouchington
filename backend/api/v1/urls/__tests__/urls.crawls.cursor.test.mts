import { beforeAll, describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
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

  it('emits a scoped cursor and rejects a simple URL cursor', async () => {
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
    await request
      .get(`/api/v1/urls/${urlId}/crawls?limit=1&after=${encodeURIComponent(legacyCursor)}`)
      .expect(400)
  })
})
