import { describe, it, expect, beforeAll } from 'vitest'
import { createRequest } from '@voucha/api/test-helpers/server'
import { createTestUser, insertTestUrlHostname, insertTestCrawler } from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'

describe('index', () => {
  let admin: PrivateUser
  let regularUser: PrivateUser

  beforeAll(async () => {
    admin = await createTestUser({ administrator: true })
    regularUser = await createTestUser()
  })
  describe('Crawlers Routes', () => {
    describe('GET /api/v1/crawlers/:id', () => {
      it('should return crawler for admin users', async () => {
        const random = Math.random().toString(36).slice(2, 8)
        const hostnameId = await insertTestUrlHostname({
          hostname: `crawler-${random}.example.com`,
        })
        const crawlerId = await insertTestCrawler({
          hostnameId,
          description: `Test crawler ${random}`,
          crawlerType: 'fetch',
          priority: 100,
        })
        const request = createRequest()
        await request.authenticateAs(admin)

        const response = await request.get(`/api/v1/crawlers/${crawlerId}`).expect(200)

        expect(response.body.crawler).toBeDefined()
        expect(response.body.crawler.id).toBe(crawlerId)
        expect(response.body.crawler.hostname_id).toBe(hostnameId)
        expect(response.body.crawler.description).toContain(random)
      })

      it('should return 403 for non-admin users', async () => {
        const random = Math.random().toString(36).slice(2, 8)
        const hostnameId = await insertTestUrlHostname({
          hostname: `forbidden-crawler-${random}.example.com`,
        })
        const crawlerId = await insertTestCrawler({
          hostnameId,
          description: `Forbidden crawler ${random}`,
        })
        const request = createRequest()
        await request.authenticateAs(regularUser)

        await request.get(`/api/v1/crawlers/${crawlerId}`).expect(403)
      })

      it('should return 404 for non-existent crawler', async () => {
        const request = createRequest()
        await request.authenticateAs(admin)

        await request.get('/api/v1/crawlers/00000000-0000-0000-0000-000000000000').expect(404)
      })
    })

    describe('PATCH /api/v1/crawlers/:id', () => {
      it('should update crawler for admin users', async () => {
        const random = Math.random().toString(36).slice(2, 8)
        const hostnameId = await insertTestUrlHostname({
          hostname: `update-crawler-${random}.example.com`,
        })
        const crawlerId = await insertTestCrawler({
          hostnameId,
          description: `Original description ${random}`,
          crawlerType: 'fetch',
          priority: 50,
        })
        const request = createRequest()
        await request.authenticateAs(admin)

        const newDescription = `Updated description ${random}`
        const response = await request
          .patch(`/api/v1/crawlers/${crawlerId}`)
          .send({
            description: newDescription,
            priority: 200,
            css_selectors_to_remove: ['.ad', '.sidebar'],
          })
          .expect(200)

        expect(response.body.crawler).toBeDefined()
        expect(response.body.crawler.id).toBe(crawlerId)
        expect(response.body.crawler.description).toBe(newDescription)
        expect(response.body.crawler.priority).toBe(200)
        expect(response.body.crawler.css_selectors_to_remove).toContain('.ad')
        expect(response.body.crawler.css_selectors_to_remove).toContain('.sidebar')
      })

      it('should update crawler_type', async () => {
        const random = Math.random().toString(36).slice(2, 8)
        const hostnameId = await insertTestUrlHostname({
          hostname: `type-update-${random}.example.com`,
        })
        const crawlerId = await insertTestCrawler({
          hostnameId,
          description: `Type test ${random}`,
          crawlerType: 'fetch',
        })
        const request = createRequest()
        await request.authenticateAs(admin)

        const response = await request
          .patch(`/api/v1/crawlers/${crawlerId}`)
          .send({
            crawler_type: 'automation',
          })
          .expect(200)

        expect(response.body.crawler.crawler_type).toBe('automation')
      })

      it('should update link removal rules', async () => {
        const random = Math.random().toString(36).slice(2, 8)
        const hostnameId = await insertTestUrlHostname({
          hostname: `link-rules-${random}.example.com`,
        })
        const crawlerId = await insertTestCrawler({
          hostnameId,
          description: `Link rules ${random}`,
        })
        const request = createRequest()
        await request.authenticateAs(admin)

        const response = await request
          .patch(`/api/v1/crawlers/${crawlerId}`)
          .send({
            link_text_content_to_remove: ['Advertisement', 'Sponsored'],
            link_hrefs_to_remove: ['/ads/', '/tracking/'],
          })
          .expect(200)

        expect(response.body.crawler.link_text_content_to_remove).toContain('Advertisement')
        expect(response.body.crawler.link_text_content_to_remove).toContain('Sponsored')
        expect(response.body.crawler.link_hrefs_to_remove).toContain('/ads/')
        expect(response.body.crawler.link_hrefs_to_remove).toContain('/tracking/')
      })

      it('should return 403 for non-admin users', async () => {
        const random = Math.random().toString(36).slice(2, 8)
        const hostnameId = await insertTestUrlHostname({
          hostname: `no-update-${random}.example.com`,
        })
        const crawlerId = await insertTestCrawler({
          hostnameId,
          description: `No update ${random}`,
        })
        const request = createRequest()
        await request.authenticateAs(regularUser)

        await request
          .patch(`/api/v1/crawlers/${crawlerId}`)
          .send({
            description: 'Should not update',
          })
          .expect(403)
      })

      it('should return 401 for logged-out users', async () => {
        const random = Math.random().toString(36).slice(2, 8)
        const hostnameId = await insertTestUrlHostname({
          hostname: `no-auth-${random}.example.com`,
        })
        const crawlerId = await insertTestCrawler({
          hostnameId,
          description: `No auth ${random}`,
        })
        const request = createRequest()

        await request
          .patch(`/api/v1/crawlers/${crawlerId}`)
          .send({
            description: 'Should not update',
          })
          .expect(401)
      })

      it('should return 404 for non-existent crawler', async () => {
        const request = createRequest()
        await request.authenticateAs(admin)

        await request
          .patch('/api/v1/crawlers/00000000-0000-0000-0000-000000000000')
          .send({
            description: 'Does not exist',
          })
          .expect(404)
      })
    })
  })
})
