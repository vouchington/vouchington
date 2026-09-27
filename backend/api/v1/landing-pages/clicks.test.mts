import { describe, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestLandingPageProfileLinkItem } from '@voucha/test-helpers'
import { registerLandingPageAnalyticsTests } from '../../../test-helpers/landing-page-analytics-route-tests.mts'

describe('clicks', () => {
  describe('POST /api/v1/landing-pages/:landingPageId/clicks', () => {
    const fixture = registerLandingPageAnalyticsTests({
      route: 'clicks',
      pageName: 'Click API Test',
      tempPrefix: 'analytics-lp-click-api-test-',
      preparePage: (userId, landingPageId) =>
        createTestLandingPageProfileLinkItem(userId, landingPageId).then(
          item => item.landingPageItemId,
        ),
      body: itemId => ({ landing_page_item_id: itemId }),
      privacyTable: 'web_click',
      privacyColumn: 'target_id',
      privacyId: 'item',
      rateLimitAttempts: 22,
    })

    it('returns 400 for missing landing_page_item_id', async () => {
      const request = createRequest()
      const session = await fixture.openSession()
      fixture.authenticate(request, session.deviceToken, session.sessionToken)

      await request
        .post(`/api/v1/landing-pages/${fixture.landingPageId()}/clicks`)
        .send({})
        .expect(400)
    })
  })
})
