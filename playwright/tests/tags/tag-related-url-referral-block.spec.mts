import { expect, test } from '../../helpers/test.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { AUTH_STATE } from '../../helpers/auth-state.mts'
import { randomSuffix } from '../../helpers/random-id.mts'
import { insertTestReferralProgram } from '../../helpers/insert-test-referral-program.mts'

// Discussion 4 is the seeded "safe for mutation" discussion used by the other
// tag-related-url tests. See playwright/tests/tags/tag-related-url.spec.mts.
const DISCUSSION_4_ID = '019c64e6-f720-7001-a001-000000000004'

test.describe('Related Links (URL tags) — referral block', () => {
  test.use({ storageState: AUTH_STATE })

  let fixture: Awaited<ReturnType<typeof insertTestReferralProgram>>
  let optionName: string

  test.beforeAll(async () => {
    fixture = await insertTestReferralProgram(randomSuffix())
    optionName = `${fixture.hostname}${fixture.urlPath}`
  })

  test('rejects adding a referral URL as a related-URL tag with an error toast', async ({
    page,
  }) => {
    await navigateTo(page, `/discussion/${DISCUSSION_4_ID}/tags/url`)

    const searchInput = page.getByTestId('tag-autocomplete-input-url')
    await searchInput.pressSequentially(fixture.hostname)

    const option = page.getByTestId('tag-autocomplete-item-url').filter({ hasText: optionName })
    await expect(option).toBeVisible()
    await option.click()

    // Toast appears via sonner; locate by its role region + referral wording.
    await expect(
      page.locator('[data-sonner-toast]').filter({ hasText: /referral link/i }),
    ).toBeVisible()

    const currentTagsSection = page.getByTestId('manage-tags-current-section')
    await expect(currentTagsSection.locator(`text=${optionName}`)).toHaveCount(0)
  })
})
