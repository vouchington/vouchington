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

    it.each([
      ['a missing landing_page_item_id', {}],
      ['a malformed landing_page_item_id', { landing_page_item_id: 'not-a-uuid' }],
      ['a non-string landing_page_item_id', { landing_page_item_id: 5 }],
      [
        'a malformed group_member_id',
        { landing_page_item_id: '00000000-0000-4000-8000-000000000000', group_member_id: 'x' },
      ],
      [
        'an unknown field',
        { landing_page_item_id: '00000000-0000-4000-8000-000000000000', extra: true },
      ],
    ])('returns 422 for %s', async (_name, body) => {
      const request = createRequest()
      const session = await fixture.openSession()
      fixture.authenticate(request, session.deviceToken, session.sessionToken)

      await request
        .post(`/api/v1/landing-pages/${fixture.landingPageId()}/clicks`)
        .send(body)
        .expect(422)
    })

    it('returns 400 for a malformed landing page id before reading the body', async () => {
      const request = createRequest()
      const session = await fixture.openSession()
      fixture.authenticate(request, session.deviceToken, session.sessionToken)

      await request
        .post('/api/v1/landing-pages/not-a-uuid/clicks')
        .send({ extra: true })
        .expect(400)
    })
  })
})
