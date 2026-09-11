import { test, expect } from '../../helpers/test.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'

// Review post that rates Chase Sapphire Preferred (card topic with referral_program_id set)
const REVIEW_WITH_REFERRAL = {
  id: '019c64e6-f720-7002-a002-000000000001',
  slug: 'great-travel-card',
}

// Discussion post (no review_topic_ratings, should not show referral section)
const DISCUSSION_POST = {
  id: '019c64e6-f720-7001-a001-000000000001',
}

test.describe('Review Referral Programs', () => {
  test('review detail page shows referral program links for reviewed topics with referral programs', async ({
    page,
  }) => {
    await navigateTo(page, `/review/${REVIEW_WITH_REFERRAL.id}`)

    const heading = page.getByTestId('review-referral-links-heading').first()
    await expect(heading).toBeVisible()

    const referralLink = page.locator('[data-pw^="review-referral-link-"]').first()
    await expect(referralLink).toBeVisible()
    await expect(referralLink).toContainText(/Chase Sapphire Preferred referral links/i)
  })

  test('review detail page accessible by slug', async ({ page }) => {
    await navigateTo(page, `/review/${REVIEW_WITH_REFERRAL.slug}`)

    const heading = page.getByTestId('review-referral-links-heading').first()
    await expect(heading).toBeVisible()
  })

  test('non-review post does not show referral programs section', async ({ page }) => {
    await navigateTo(page, `/discussion/${DISCUSSION_POST.id}`)

    await expect(page.getByTestId('review-referral-links-heading')).toHaveCount(0)
  })
})
