import { test, expect } from '../../helpers/test.mts'
import { AUTH_STATE } from '../../helpers/auth-state.mts'
import { TEST_PNG } from '../../helpers/test-fixtures.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { insertTestImage } from '../../../backend/test-helpers/entities/images.mts'
import {
  allowTestUserProfileImageDelivery,
  setTestUserProfileImage,
} from '../../../backend/test-helpers/entities/image-surface-placements.mts'
import { invalidate } from '../../../backend/services/entity-cache/index.mts'

const TEST_USER_ID = '019f0000-0000-7000-8000-000000000000'

test.describe('Identity Profile Image', () => {
  test.use({ storageState: AUTH_STATE })
  test.describe.configure({ mode: 'serial' })

  test.beforeAll(async () => {
    // Reset profile_image_id so reruns start from a clean state.
    // These tests must update TEST_USER_ID directly — a generic per-spec login
    // user would require a new test-login endpoint (larger refactor).
    await setTestUserProfileImage(TEST_USER_ID, null)
    // Invalidate entity cache so the reset is visible on the next page load.
    await invalidate.users(TEST_USER_ID)
  })

  test('shows profile image section with upload button', async ({ page }) => {
    // beforeAll already reset profile_image_id = NULL; navigate now so the
    // entity cache is populated with the correct (null) state.
    await navigateTo(page, '/my/identity')
    await expect(page.getByTestId('identity-profile-image-heading')).toBeVisible()

    await expect(page.getByTestId('identity-profile-image-upload')).toBeAttached()
    const uploadButton = page.getByTestId('identity-profile-image-upload-trigger')
    await expect(uploadButton).toBeVisible()
  })

  test('shows avatar preview when profile image is already set', async ({ page }) => {
    const imageId = await insertTestImage(TEST_USER_ID)
    await setTestUserProfileImage(TEST_USER_ID, imageId)
    await allowTestUserProfileImageDelivery({ userId: TEST_USER_ID, imageId })
    await invalidate.users(TEST_USER_ID)

    await page.route(
      url => new URL(url.toString()).pathname.startsWith('/images/'),
      route => route.fulfill({ body: TEST_PNG, contentType: 'image/png', status: 200 }),
    )

    await navigateTo(page, '/my/identity')

    // Avatar image should now be visible
    await expect(page.getByTestId('user-avatar').first()).toBeVisible()

    // Remove button should appear
    await expect(page.getByTestId('identity-profile-image-remove')).toBeVisible()
  })

  test('removes profile image when clicking remove', async ({ page }) => {
    const imageId = await insertTestImage(TEST_USER_ID)
    await setTestUserProfileImage(TEST_USER_ID, imageId)
    await allowTestUserProfileImageDelivery({ userId: TEST_USER_ID, imageId })
    await invalidate.users(TEST_USER_ID)

    await page.route(
      url => new URL(url.toString()).pathname.startsWith('/images/'),
      route => route.fulfill({ body: TEST_PNG, contentType: 'image/png', status: 200 }),
    )

    await navigateTo(page, '/my/identity')

    // Remove button should be visible (image is seeded)
    await expect(page.getByTestId('identity-profile-image-remove')).toBeVisible()

    // Click remove
    await page.getByTestId('identity-profile-image-remove').click()
    await expect(page.locator('[data-sonner-toast][data-type="success"]')).toContainText(
      /profile image removed/i,
    )

    // Remove button should be gone
    await expect(page.getByTestId('identity-profile-image-remove')).toBeHidden()
  })
})
