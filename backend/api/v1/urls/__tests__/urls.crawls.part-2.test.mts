import { describe, it, expect, beforeAll } from 'vitest'
import { createRequest } from '@voucha/api/test-helpers/server'
import {
  createTestUser,
  insertTestUrl,
  insertTestUrlHostname,
  insertTestCrawl,
  createTestMembership,
  updateTestMembershipExpiresAt,
} from '@voucha/test-helpers'
import { updateCrawl } from '@services/crawls'
import type { PrivateUser } from '@services/users/types'

describe('URLs Routes - crawl detail og_image_sideload', () => {
  let admin: PrivateUser
  let proUser: PrivateUser

  beforeAll(async () => {
    admin = await createTestUser({ administrator: true })
    proUser = await createTestUser()
    await createTestMembership({ user_id: proUser.id, plan: 'pro' })
  }, 60_000)

  it.each([
    ['plus', 'active', 200],
    ['plus', 'past_due', 200],
    ['pro', 'active', 200],
    ['pro', 'past_due', 200],
    ['plus', 'paused', 403],
    ['plus', 'cancelled', 403],
    ['plus', 'expired', 403],
  ])('enforces %s %s crawl-history access', async (plan, status, expectedStatus) => {
    const member = await createTestUser()
    await createTestMembership({
      user_id: member.id,
      plan: plan as never,
      status: status as never,
    })
    const random = Math.random().toString(36).slice(2, 8)
    const hostnameId = await insertTestUrlHostname({
      hostname: `lifecycle-${random}.example.com`,
    })
    const urlId = await insertTestUrl({
      url: `https://lifecycle-${random}.example.com/page`,
      hostnameId,
    })
    const request = createRequest()
    await request.authenticateAs(member)

    await request.get(`/api/v1/urls/${urlId}/crawls`).expect(expectedStatus)
  })

  it('denies crawl history after a finite paid grant expires', async () => {
    const elapsedUser = await createTestUser()
    const membership = await createTestMembership({ user_id: elapsedUser.id, plan: 'plus' })
    await updateTestMembershipExpiresAt(membership.id, new Date(Date.now() - 1_000))
    const random = Math.random().toString(36).slice(2, 8)
    const hostnameId = await insertTestUrlHostname({
      hostname: `elapsed-lifecycle-${random}.example.com`,
    })
    const urlId = await insertTestUrl({
      url: `https://elapsed-lifecycle-${random}.example.com/page`,
      hostnameId,
    })
    const request = createRequest()
    await request.authenticateAs(elapsedUser)

    await request.get(`/api/v1/urls/${urlId}/crawls`).expect(403)
  })

  it('allows an eligible paid user to view another user’s public URL crawl safely', async () => {
    const paidUser = await createTestUser()
    await createTestMembership({ user_id: paidUser.id, plan: 'plus', status: 'past_due' })
    const random = Math.random().toString(36).slice(2, 8)
    const hostnameId = await insertTestUrlHostname({
      hostname: `cross-user-${random}.example.com`,
    })
    const urlId = await insertTestUrl({
      url: `https://cross-user-${random}.example.com/page`,
      hostnameId,
    })
    const { id: crawlId } = await insertTestCrawl({
      urlId,
      statusCode: 200,
      markdown: 'private',
    })
    await updateCrawl(crawlId, urlId, {
      request_headers: { 'user-agent': 'test-bot' },
      html_sha256: Buffer.alloc(32, 1),
    })
    const request = createRequest()
    await request.authenticateAs(paidUser)
    const response = await request.get(`/api/v1/urls/${urlId}/crawls/${crawlId}`).expect(200)

    expect(response.body.crawl).not.toHaveProperty('markdown')
    expect(response.body.crawl).not.toHaveProperty('request_headers')
  })

  it('returns 404 for a non-existent crawl to an admin', async () => {
    const random = Math.random().toString(36).slice(2, 8)
    const hostnameId = await insertTestUrlHostname({
      hostname: `missing-crawl-${random}.example.com`,
    })
    const urlId = await insertTestUrl({
      url: `https://missing-crawl-${random}.example.com/page`,
      hostnameId,
    })
    const request = createRequest()
    await request.authenticateAs(admin)

    await request
      .get(`/api/v1/urls/${urlId}/crawls/00000000-0000-0000-0000-000000000000`)
      .expect(404)
  })

  describe('GET /api/v1/urls/:id/crawls/:crawlId og_image_sideload', () => {
    it('falls through an unproxyable normalized thumbnail to a valid social image', async () => {
      const random = Math.random().toString(36).slice(2, 8)
      const hostnameId = await insertTestUrlHostname({
        hostname: `thumbnail-fallback-${random}.example.com`,
      })
      const urlId = await insertTestUrl({
        url: `https://thumbnail-fallback-${random}.example.com/page`,
        hostnameId,
      })
      const fallbackImage = `https://images.example.com/${random}.png`
      const { id: crawlId } = await insertTestCrawl({
        urlId,
        statusCode: 200,
        markdown: '',
        embedMetadata: {
          kind: 'article',
          requestedUrl: `https://thumbnail-fallback-${random}.example.com/page`,
          resolvedUrl: `https://thumbnail-fallback-${random}.example.com/page`,
          title: null,
          description: null,
          author: null,
          provider: null,
          thumbnail: { url: 'https://[invalid', width: null, height: null },
          player: null,
        },
        metaTags: {
          'og:image': 'data:image/png;base64,invalid',
          'twitter:image': fallbackImage,
        },
      })
      const request = createRequest()
      await request.authenticateAs(admin)

      const response = await request.get(`/api/v1/urls/${urlId}/crawls/${crawlId}`).expect(200)

      expect(response.body.og_image_sideload).toContain(
        Buffer.from(fallbackImage).toString('base64url'),
      )
    })

    it('returns og_image_sideload proxied through /sideload/ for admin when crawl has og:image', async () => {
      const random = Math.random().toString(36).slice(2, 8)
      const hostnameId = await insertTestUrlHostname({
        hostname: `og-crawl-admin-${random}.example.com`,
      })
      const urlId = await insertTestUrl({
        url: `https://og-crawl-admin-${random}.example.com/page`,
        hostnameId,
      })
      const { id: crawlId } = await insertTestCrawl({
        urlId,
        statusCode: 200,
        markdown: '',
        metaTags: { 'og:image': 'https://example.com/image.png' },
      })
      const request = createRequest()
      await request.authenticateAs(admin)

      const response = await request.get(`/api/v1/urls/${urlId}/crawls/${crawlId}`).expect(200)

      expect(response.body.og_image_sideload).toMatch(/^https?:\/\/[^/]+\/sideload\//)
      expect(response.body.og_image_sideload).toContain('w=400')
    }, 60_000)

    it('does not expose an og_image_sideload to paid users', async () => {
      const random = Math.random().toString(36).slice(2, 8)
      const hostnameId = await insertTestUrlHostname({
        hostname: `og-crawl-pro-${random}.example.com`,
      })
      const urlId = await insertTestUrl({
        url: `https://og-crawl-pro-${random}.example.com/page`,
        hostnameId,
      })
      const { id: crawlId } = await insertTestCrawl({
        urlId,
        statusCode: 200,
        markdown: '',
        metaTags: { 'og:image': 'https://example.com/thumb.jpg' },
      })
      const request = createRequest()
      await request.authenticateAs(proUser)

      const response = await request.get(`/api/v1/urls/${urlId}/crawls/${crawlId}`).expect(200)

      expect(response.body).not.toHaveProperty('og_image_sideload')
    }, 60_000)

    it('returns null og_image_sideload when crawl has no og:image', async () => {
      const random = Math.random().toString(36).slice(2, 8)
      const hostnameId = await insertTestUrlHostname({
        hostname: `no-og-crawl-${random}.example.com`,
      })
      const urlId = await insertTestUrl({
        url: `https://no-og-crawl-${random}.example.com/page`,
        hostnameId,
      })
      const { id: crawlId } = await insertTestCrawl({
        urlId,
        statusCode: 200,
        markdown: '',
      })
      const request = createRequest()
      await request.authenticateAs(proUser)

      const response = await request.get(`/api/v1/urls/${urlId}/crawls/${crawlId}`).expect(200)

      expect(response.body).not.toHaveProperty('og_image_sideload')
    }, 60_000)
  })
})
