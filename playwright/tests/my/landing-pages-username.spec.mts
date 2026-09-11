import { test, expect } from '../../helpers/test.mts'
import { loginAsUser } from '../../helpers/auth.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { randomSuffix } from '../../helpers/random-id.mts'
import {
  createTestUserWithAge,
  CONTRIBUTING_USER_AGE_MS,
} from '../../../backend/test-helpers/index.mts'

let userId: string

test.beforeEach(async () => {
  const user = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS, { noUsername: true })
  if (!user) throw new Error('Failed to create test user')
  userId = user.id
})

test.describe('my/landing-pages — username gate', () => {
  test('shows CTA when user has no username', async ({ page }) => {
    await loginAsUser(page, userId)
    await navigateTo(page, '/my/landing-pages')

    await expect(page.getByTestId('landing-pages-required-heading')).toBeVisible()
    await expect(page.getByTestId('landing-pages-choose-username')).toBeVisible()
    await expect(page.getByTestId('landing-pages-identity-settings-link')).toBeVisible()
  })

  test('opens username dialog when CTA is clicked', async ({ page }) => {
    await loginAsUser(page, userId)
    await navigateTo(page, '/my/landing-pages')

    await page.getByTestId('landing-pages-choose-username').click()

    await expect(page.getByTestId('username-required-dialog')).toBeVisible()
  })

  test('after choosing a username, landing pages manager is shown', async ({ page }) => {
    await loginAsUser(page, userId)
    await navigateTo(page, '/my/landing-pages')

    await page.getByTestId('landing-pages-choose-username').click()
    await expect(page.getByTestId('username-required-dialog')).toBeVisible()

    const suffix = randomSuffix()
    const username = `lp-${suffix}`
    await page.getByTestId('username-required-dialog-input').pressSequentially(username)
    await page.getByTestId('username-required-dialog-submit').click()

    // After refresh the manager should render the create-page form.
    // Note: ensureDefaultLandingPage auto-creates a page when a username is set,
    // so the page list (not empty state) will show here.
    await expect(page.getByTestId('landing-pages-create-button')).toBeVisible()
  })
})
