import { beforeAll, describe, expect, it } from 'vitest'
import { encodeCursor } from '@modules/pagination'
import {
  createTestLandingPage,
  createTestLandingPageProfileLinkItem,
  createTestUserDirect,
  setUserReferrerId,
} from '@voucha/test-helpers'
import { createRequest } from '@voucha/test-helpers/api/server'
import type { PrivateUser } from '@services/users/types'
import { v7 } from 'uuid'

describe('admin landing pages', () => {
  let admin: PrivateUser
  let regularUser: PrivateUser
  let landingPageId: string

  beforeAll(async () => {
    admin = await createTestUserDirect({ administrator: true })
    regularUser = await createTestUserDirect()

    const page = await createTestLandingPage(regularUser.id, 'Admin landing page')
    landingPageId = page.landingPageId
    await createTestLandingPageProfileLinkItem(regularUser.id, landingPageId)
  })

  describe('GET /api/v1/admin/users/:userId/landing-pages', () => {
    it('returns 403 for non-admin users', async () => {
      const request = createRequest()
      await request.authenticateAs(regularUser)
      await request.get(`/api/v1/admin/users/${regularUser.id}/landing-pages`).expect(403)
    })

    it('returns the target user landing pages for admins', async () => {
      const request = createRequest()
      await request.authenticateAs(admin)

      const response = await request
        .get(`/api/v1/admin/users/${regularUser.id}/landing-pages`)
        .expect(200)

      expect(response.body.results).toHaveLength(1)
      expect(response.body.results[0].id).toBe(landingPageId)
      expect(response.body.page_info).toMatchObject({
        has_next_page: false,
        end_cursor: null,
      })
      expect(response.body.page_info.start_cursor).toBeTruthy()
    })

    it('paginates the target user landing pages for admins', async () => {
      const targetUser = await createTestUserDirect()
      const firstPageRecord = await createTestLandingPage(targetUser.id, 'Admin landing page 1')
      const secondPageRecord = await createTestLandingPage(targetUser.id, 'Admin landing page 2')

      const request = createRequest()
      await request.authenticateAs(admin)

      const firstPage = await request
        .get(`/api/v1/admin/users/${targetUser.id}/landing-pages`)
        .query({ limit: 1 })
        .expect(200)

      expect(firstPage.body.results).toHaveLength(1)
      expect(firstPage.body.results[0].id).toBe(firstPageRecord.landingPageId)
      expect(firstPage.body.page_info.has_next_page).toBe(true)
      expect(firstPage.body.page_info.start_cursor).toBeTruthy()
      expect(firstPage.body.page_info.end_cursor).toBeTruthy()

      const secondPage = await request
        .get(`/api/v1/admin/users/${targetUser.id}/landing-pages`)
        .query({ limit: 1, after: firstPage.body.page_info.end_cursor })
        .expect(200)

      expect(secondPage.body.results).toHaveLength(1)
      expect(secondPage.body.results[0].id).toBe(secondPageRecord.landingPageId)
      expect(secondPage.body.page_info).toMatchObject({
        has_next_page: false,
        end_cursor: null,
      })
      expect(secondPage.body.page_info.start_cursor).toBeTruthy()
    })

    it('returns 400 for malformed cursors', async () => {
      const request = createRequest()
      await request.authenticateAs(admin)
      await request
        .get(`/api/v1/admin/users/${regularUser.id}/landing-pages`)
        .query({ after: 'not-a-cursor' })
        .expect(400)
    })

    it('returns 400 for a cursor scoped to another user', async () => {
      const request = createRequest()
      await request.authenticateAs(admin)
      await request
        .get(`/api/v1/admin/users/${regularUser.id}/landing-pages`)
        .query({
          after: encodeCursor({
            tier: 1,
            id: landingPageId,
            scope: `landing-pages:user:${admin.id}:is-default-desc-id-asc`,
          }),
        })
        .expect(400)
    })
  })

  describe('GET /api/v1/admin/landing-pages/:pageId/analytics', () => {
    it('returns 403 for non-admin users', async () => {
      const request = createRequest()
      await request.authenticateAs(regularUser)
      await request.get(`/api/v1/admin/landing-pages/${landingPageId}/analytics`).expect(403)
    })

    it('returns landing page detail and analytics for admins', async () => {
      const request = createRequest()
      await request.authenticateAs(admin)

      const before = await request
        .get(`/api/v1/admin/landing-pages/${landingPageId}/analytics`)
        .expect(200)

      const referredA = await createTestUserDirect()
      const referredB = await createTestUserDirect()
      await Promise.all([
        setUserReferrerId(referredA!.id, regularUser.id),
        setUserReferrerId(referredB!.id, regularUser.id),
      ])

      const after = await request
        .get(`/api/v1/admin/landing-pages/${landingPageId}/analytics`)
        .expect(200)

      expect(after.body.landing_page.id).toBe(landingPageId)
      expect(after.body.landing_page.items).toHaveLength(1)
      expect(
        after.body.analytics.conversion_funnel.total_signups -
          before.body.analytics.conversion_funnel.total_signups,
      ).toBe(2)
    })

    it('returns 404 for a missing page', async () => {
      const request = createRequest()
      await request.authenticateAs(admin)
      await request.get(`/api/v1/admin/landing-pages/${v7()}/analytics`).expect(404)
    })
  })
})
