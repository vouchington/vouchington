import { expect, test } from '../../helpers/test.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'

// Seed data: Review post '019c64e6-f720-7002-a002-000000000001'
// Tests run anonymously — AnonymousStructuredDataScript renders JSON-LD only for
// unauthenticated viewers, so we need the anonymous code path to exercise both
// the hydration warning and the script-tag warning.

const REVIEW_ID = '019c64e6-f720-7002-a002-000000000001'
const REVIEW_PATH = `/review/${REVIEW_ID}`

test.describe('review page — no render errors', () => {
  test('hard navigation: no hydration or script-tag warnings', async ({ page }) => {
    await navigateTo(page, REVIEW_PATH)

    await expect(page.getByTestId('post-detail-type-badge-review')).toBeVisible()
  })

  test('soft navigation from home: no hydration or script-tag warnings', async ({ page }) => {
    // Start at the home page so the first navigation to /review is a client-side transition.
    // This exercises the scenario where React renders the <script> tag on the client
    // (client-side navigation, not server-rendered HTML).
    await navigateTo(page, '/')

    // Navigate to review via the address bar (SPA navigation via Next.js router)
    await navigateTo(page, REVIEW_PATH)

    await expect(page.getByTestId('post-detail-type-badge-review')).toBeVisible()
  })
})
