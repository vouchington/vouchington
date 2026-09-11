import { test, expect } from '../../helpers/test.mts'
import { AUTH_STATE } from '../../helpers/auth-state.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { randomSuffix } from '../../helpers/random-id.mts'

/**
 * Community create page tests.
 * Tests the create community form UI and flow.
 */

test.describe('Community Create Page', () => {
  test('unauthenticated user is redirected to login', async ({ page }) => {
    await navigateTo(page, '/communities/create')
    await expect(page).toHaveURL('/login')
  })

  test.describe('authenticated', () => {
    test.use({ storageState: AUTH_STATE })

    test.beforeEach(async ({ page }) => {
      await navigateTo(page, '/communities/create')
    })

    test('displays Create a Community heading', async ({ page }) => {
      await expect(page.getByRole('heading', { level: 1 })).toContainText('Create a Community')
    })

    test('displays Community Name input', async ({ page }) => {
      await expect(page.getByTestId('create-community-name-input')).toBeVisible()
    })

    test('displays Slug input', async ({ page }) => {
      await expect(page.getByTestId('create-community-slug-input')).toBeVisible()
    })

    test('displays Description textarea', async ({ page }) => {
      await expect(page.getByTestId('create-community-description-textarea')).toBeVisible()
    })

    test('Create Community button is disabled when name is empty', async ({ page }) => {
      await expect(page.getByTestId('create-community-submit-button')).toBeDisabled()
    })

    test('Create Community button is disabled when name has fewer than 3 words', async ({
      page,
    }) => {
      await page.getByTestId('create-community-name-input').pressSequentially('Only Two')
      await expect(page.getByTestId('create-community-submit-button')).toBeDisabled()
      await expect(page.getByTestId('create-community-name-error')).toBeVisible()
    })

    test('Create Community button is enabled when name has 3 or more words', async ({ page }) => {
      await page.getByTestId('create-community-name-input').pressSequentially('My Test Community')
      await expect(page.getByTestId('create-community-submit-button')).toBeEnabled()
    })

    test('slug field does not auto-populate from name', async ({ page }) => {
      await page.getByTestId('create-community-name-input').pressSequentially('My Test Community')
      await expect(page.getByTestId('create-community-slug-input')).toHaveValue('')
    })

    test('creates community and redirects to community page when slug is blank', async ({
      page,
    }) => {
      const suffix = randomSuffix()
      const name = `PW Create ${suffix}`
      await page.getByTestId('create-community-name-input').pressSequentially(name)
      // Leave slug blank — server will auto-generate with base36 suffix
      await page.getByTestId('create-community-submit-button').click()

      // Redirect to the auto-generated slug (includes base36 suffix)
      await page.waitForURL(/\/communities\/pw-create-/)
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    })

    test('creates community with explicit slug and redirects', async ({ page }) => {
      const suffix = randomSuffix()
      const name = `PW Create Slug ${suffix}`
      const slug = `pw-create-slug-${suffix}`
      await page.getByTestId('create-community-name-input').pressSequentially(name)
      await page.getByTestId('create-community-slug-input').pressSequentially(slug)
      await page.getByTestId('create-community-submit-button').click()

      // The redirected URL proves the exact slug value was captured and submitted —
      // stronger than re-reading the input immediately after typing into it.
      await page.waitForURL(`/communities/${slug}`)
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    })
  })
})
