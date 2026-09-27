import { describe, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { registerLandingPageAnalyticsTests } from '../../../test-helpers/landing-page-analytics-route-tests.mts'

describe('visits', () => {
  describe('POST /api/v1/landing-pages/:landingPageId/visits', () => {
    const fixture = registerLandingPageAnalyticsTests({
      route: 'visits',
      pageName: 'Visit API Test',
      tempPrefix: 'analytics-lp-visit-api-test-',
      preparePage: async () => undefined,
      body: () => ({}),
      gpcBody: () => ({ utm_source: 'instagram', utm_medium: 'bio' }),
      privacyTable: 'web_page_view',
      privacyColumn: 'page_id',
      privacyId: 'page',
      rateLimitAttempts: 7,
    })

    it('returns 200 with UTM params', async () => {
      const request = createRequest()
      const session = await fixture.openSession()
      fixture.authenticate(request, session.deviceToken, session.sessionToken)

      await request
        .post(`/api/v1/landing-pages/${fixture.landingPageId()}/visits`)
        .send({ utm_source: 'instagram', utm_medium: 'bio' })
        .expect(200)
    })

    it('returns 400 for invalid UUID', async () => {
      const request = createRequest()
      const session = await fixture.openSession()
      fixture.authenticate(request, session.deviceToken, session.sessionToken)

      await request.post('/api/v1/landing-pages/not-a-uuid/visits').send({}).expect(400)
    })
  })
})
