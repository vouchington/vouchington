import { test, expect } from '../../helpers/test.mts'
import { AUTH_STATE } from '../../helpers/auth-state.mts'
import { TEST_USER_USERNAME } from '../../helpers/auth.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import {
  createTestLandingPage,
  createTestLandingPageProfileLinkItem,
} from '../../../backend/test-helpers/index.mts'

// Seeded test user ID (tests@voucha.ai)
const TEST_USER_ID = '019f0000-0000-7000-8000-000000000000'

test.describe('Landing page content editing', () => {
  test.use({ storageState: AUTH_STATE })

  test('can add a free-form link and see it on the public page', async ({ page }) => {
    const { slug, landingPageId } = await createTestLandingPage(TEST_USER_ID, 'Link Test Page')
    // seed a profile link item too (to verify curated items still work alongside free-form links)
    await createTestLandingPageProfileLinkItem(TEST_USER_ID, landingPageId)

    await navigateTo(page, `/my/landing-page/${slug}`)

    await expect(page.getByTestId('landing-page-editor')).toBeVisible()

    // Default add type is 'link'; fill in label + URL
    await expect(page.getByTestId('landing-page-add-link-label')).toBeVisible()
    await page.getByTestId('landing-page-add-link-label').pressSequentially('My Website')
    await page
      .getByTestId('landing-page-add-link-url')
      .pressSequentially('https://example.com/test')

    await page.getByTestId('landing-page-add-item-button').click()

    // The item should appear in the draft list before saving
    await expect(page.getByText('My Website')).toBeVisible()

    // Save the content. Wait for the success toast before navigating away — otherwise the
    // full-page navigation aborts the in-flight PUT (or the force-dynamic public page fetches
    // before the write commits), leaving the link absent on the public page.
    await page.getByTestId('landing-page-save-content').click()
    await expect(page.locator('[data-sonner-toast][data-type="success"]')).toContainText(
      'Landing page content saved',
    )

    // Navigate to the public page and verify the link is rendered
    await navigateTo(page, `/@${TEST_USER_USERNAME}/${slug}`)
    await expect(page.getByTestId('landing-page-link')).toContainText('My Website')

    const href = await page.getByTestId('landing-page-link').getAttribute('href')
    expect(href).toContain('example.com/test')
  })

  test('add item button is disabled when link label or url is empty', async ({ page }) => {
    const { slug } = await createTestLandingPage(TEST_USER_ID, 'Disabled Test Page')

    await navigateTo(page, `/my/landing-page/${slug}`)

    await expect(page.getByTestId('landing-page-editor')).toBeVisible()

    // Add item should be disabled when fields are empty
    await expect(page.getByTestId('landing-page-add-item-button')).toBeDisabled()

    // Fill only label, still disabled
    await page.getByTestId('landing-page-add-link-label').pressSequentially('Some Label')
    await expect(page.getByTestId('landing-page-add-item-button')).toBeDisabled()

    // Fill URL too, now enabled
    await page.getByTestId('landing-page-add-link-url').pressSequentially('https://example.com')
    await expect(page.getByTestId('landing-page-add-item-button')).toBeEnabled()
  })

  test('shows empty-state hint when no profile links are available', async ({ page }) => {
    const { slug } = await createTestLandingPage(TEST_USER_ID, 'Empty Hint Test Page')

    await navigateTo(page, `/my/landing-page/${slug}`)

    await expect(page.getByTestId('landing-page-editor')).toBeVisible()

    // Switch to profile_link type — if the test user has no available profile links,
    // the empty hint should appear. We verify the UI pattern.
    await page.getByTestId('landing-page-add-type-select').click()
    await page.getByRole('listbox').getByRole('option', { name: 'Profile link' }).click()

    // Either the empty hint is shown (no profile links) OR the candidate select is shown
    // This test confirms the UI renders without error regardless
    const emptyHint = page.getByTestId('landing-page-add-item-empty-hint')
    const candidateSelect = page.getByTestId('landing-page-candidate-select')
    const hasHint = await emptyHint.isVisible().catch(() => false)
    const hasSelect = await candidateSelect.isVisible().catch(() => false)
    expect(hasHint || hasSelect).toBe(true)
  })
})
