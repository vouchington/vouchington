import { describe, it, expect, beforeAll } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUserDirect, createReferralProgramFixture } from '@voucha/test-helpers'
import { addUrl } from '@services/urls/upsert'
import { createCrawler } from '@services/crawlers'
import type { PrivateUser } from '@services/users/types'

describe('crawlers', () => {
  let admin: PrivateUser
  let regularUser: PrivateUser

  beforeAll(async () => {
    ;[admin, regularUser] = await Promise.all([
      createTestUserDirect({ administrator: true }),
      createTestUserDirect(),
    ])
  })

  describe('GET /api/v1/crawlers', () => {
    it('returns 401 when not authenticated', async () => {
      const request = createRequest()
      await request.get('/api/v1/crawlers').expect(401)
    })

    it('returns 403 for non-admin users', async () => {
      const request = createRequest()
      await request.authenticateAs(regularUser)
      await request.get('/api/v1/crawlers').expect(403)
    })

    it('returns all crawlers when no filter provided', async () => {
      const request = createRequest()
      await request.authenticateAs(admin)
      const response = await request.get('/api/v1/crawlers').expect(200)
      expect(response.body).toHaveProperty('results')
      expect(Array.isArray(response.body.results)).toBe(true)
      expect(response.body).toHaveProperty('page_info')
    })

    it('supports cursor pagination with after parameter', async () => {
      const suffix = Math.random().toString(36).slice(2, 10)
      const url = await addUrl(admin.id, `https://admin-crawlers-cursor-${suffix}.example.com/test`)

      await createCrawler(admin, {
        hostname_id: url!.hostname.id,
        crawler_type: 'fetch',
      })

      const request = createRequest()
      await request.authenticateAs(admin)

      const firstResponse = await request.get('/api/v1/crawlers?limit=1').expect(200)
      expect(firstResponse.body.page_info).toHaveProperty('end_cursor')

      const cursor = firstResponse.body.page_info.end_cursor as string | null
      if (!cursor) return

      const secondResponse = await request
        .get(`/api/v1/crawlers?limit=1&after=${encodeURIComponent(cursor)}`)
        .expect(200)

      expect(secondResponse.body).toHaveProperty('results')
      expect(Array.isArray(secondResponse.body.results)).toBe(true)
      expect(secondResponse.body).toHaveProperty('page_info')
    })

    it('returns crawlers by hostname_id', async () => {
      const suffix = Math.random().toString(36).slice(2, 10)
      const url = await addUrl(admin.id, `https://admin-crawlers-get-${suffix}.example.com/test`)

      const crawler = await createCrawler(admin, {
        hostname_id: url!.hostname.id,
        crawler_type: 'fetch',
      })

      const request = createRequest()
      await request.authenticateAs(admin)
      const response = await request
        .get(`/api/v1/crawlers?hostname_id=${url!.hostname.id}`)
        .expect(200)

      expect(response.body).toHaveProperty('results')
      expect(Array.isArray(response.body.results)).toBe(true)
      const ids = response.body.results.map((c: { id: string }) => c.id)
      expect(ids).toContain(crawler.id)
    })

    it('returns crawlers by referral_program_id', async () => {
      const suffix = Math.random().toString(36).slice(2, 10)
      const fixture = await createReferralProgramFixture({
        createdById: admin.id,
        randomSuffix: suffix,
        hostname: `admin-crawlers-rp-${suffix}.example.com`,
      })
      const url = await addUrl(admin.id, `https://admin-crawlers-rp-${suffix}.example.com/ref/abc`)

      const programCrawler = await createCrawler(admin, {
        hostname_id: url!.hostname.id,
        referral_program_id: fixture.referralProgramId,
        crawler_type: 'fetch',
      })

      const request = createRequest()
      await request.authenticateAs(admin)
      const response = await request
        .get(`/api/v1/crawlers?referral_program_id=${fixture.referralProgramId}`)
        .expect(200)

      expect(response.body).toHaveProperty('results')
      const ids = response.body.results.map((c: { id: string }) => c.id)
      expect(ids).toContain(programCrawler.id)
    })
  })

  describe('PUT /api/v1/crawlers/referral-program', () => {
    it('returns 401 when not authenticated', async () => {
      const request = createRequest()
      await request
        .put('/api/v1/crawlers/referral-program')
        .send({
          hostname_id: '00000000-0000-0000-0000-000000000000',
          referral_program_id: '00000000-0000-0000-0000-000000000001',
        })
        .expect(401)
    })

    it('returns 403 for non-admin users', async () => {
      const request = createRequest()
      await request.authenticateAs(regularUser)
      await request
        .put('/api/v1/crawlers/referral-program')
        .send({
          hostname_id: '00000000-0000-0000-0000-000000000000',
          referral_program_id: '00000000-0000-0000-0000-000000000001',
        })
        .expect(403)
    })

    it('admin can upsert a crawler for a referral program (creates new)', async () => {
      const suffix = Math.random().toString(36).slice(2, 10)
      const fixture = await createReferralProgramFixture({
        createdById: admin.id,
        randomSuffix: suffix,
        hostname: `admin-upsert-create-${suffix}.example.com`,
      })
      const url = await addUrl(
        admin.id,
        `https://admin-upsert-create-${suffix}.example.com/ref/abc`,
      )

      const request = createRequest()
      await request.authenticateAs(admin)
      const response = await request
        .put('/api/v1/crawlers/referral-program')
        .send({
          hostname_id: url!.hostname.id,
          referral_program_id: fixture.referralProgramId,
          crawler_type: 'automation',
          content_selectors: ['.main-content'],
          css_selectors_to_remove: ['.ads'],
        })
        .expect(200)

      expect(response.body.crawler).toHaveProperty('id')
      expect(response.body.crawler.crawler_type).toBe('automation')
      expect(response.body.crawler.content_selectors).toEqual(['.main-content'])
      expect(response.body.crawler.css_selectors_to_remove).toEqual(['.ads'])
      expect(response.body.crawler.referral_program_id).toBe(fixture.referralProgramId)
    })

    it('admin can upsert a crawler for a referral program (updates existing)', async () => {
      const suffix = Math.random().toString(36).slice(2, 10)
      const fixture = await createReferralProgramFixture({
        createdById: admin.id,
        randomSuffix: suffix,
        hostname: `admin-upsert-update-${suffix}.example.com`,
      })
      const url = await addUrl(
        admin.id,
        `https://admin-upsert-update-${suffix}.example.com/ref/abc`,
      )

      // Create an initial crawler
      const request = createRequest()
      await request.authenticateAs(admin)
      const first = await request
        .put('/api/v1/crawlers/referral-program')
        .send({
          hostname_id: url!.hostname.id,
          referral_program_id: fixture.referralProgramId,
          crawler_type: 'fetch',
        })
        .expect(200)

      const firstId = first.body.crawler.id

      // Upsert again — should update the same crawler
      const second = await request
        .put('/api/v1/crawlers/referral-program')
        .send({
          hostname_id: url!.hostname.id,
          referral_program_id: fixture.referralProgramId,
          crawler_type: 'automation',
          content_selectors: ['.updated'],
        })
        .expect(200)

      expect(second.body.crawler.id).toBe(firstId)
      expect(second.body.crawler.crawler_type).toBe('automation')
      expect(second.body.crawler.content_selectors).toEqual(['.updated'])
    })
  })

  describe('PATCH /api/v1/crawlers/:id', () => {
    it('returns 401 when not authenticated', async () => {
      const request = createRequest()
      await request
        .patch('/api/v1/crawlers/00000000-0000-0000-0000-000000000000')
        .send({ crawler_type: 'fetch' })
        .expect(401)
    })

    it('returns 403 for non-admin users', async () => {
      const suffix = Math.random().toString(36).slice(2, 10)
      const url = await addUrl(admin.id, `https://admin-patch-403-${suffix}.example.com/test`)

      const request = createRequest()
      await request.authenticateAs(regularUser)
      await request
        .patch(`/api/v1/crawlers/${url!.hostname.id}`)
        .send({ crawler_type: 'fetch' })
        .expect(403)
    })

    it('admin can update crawler fields', async () => {
      const suffix = Math.random().toString(36).slice(2, 10)
      const fixture = await createReferralProgramFixture({
        createdById: admin.id,
        randomSuffix: suffix,
        hostname: `admin-patch-update-${suffix}.example.com`,
      })
      const url = await addUrl(admin.id, `https://admin-patch-update-${suffix}.example.com/ref/abc`)

      const crawler = await createCrawler(admin, {
        hostname_id: url!.hostname.id,
        referral_program_id: fixture.referralProgramId,
        crawler_type: 'fetch',
      })

      const request = createRequest()
      await request.authenticateAs(admin)
      const response = await request
        .patch(`/api/v1/crawlers/${crawler.id}`)
        .send({
          crawler_type: 'automation',
          content_selectors: ['.patch-content'],
          css_selectors_to_remove: ['.patch-ads'],
        })
        .expect(200)

      expect(response.body.crawler.id).toBe(crawler.id)
      expect(response.body.crawler.crawler_type).toBe('automation')
      expect(response.body.crawler.content_selectors).toEqual(['.patch-content'])
      expect(response.body.crawler.css_selectors_to_remove).toEqual(['.patch-ads'])
    })

    it('returns 404 for non-existent crawler', async () => {
      const request = createRequest()
      await request.authenticateAs(admin)
      await request
        .patch('/api/v1/crawlers/00000000-0000-0000-0000-000000000001')
        .send({ crawler_type: 'fetch' })
        .expect(404)
    })
  })
})
