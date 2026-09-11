import { test, expect } from '../../helpers/test.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { randomSuffix } from '../../helpers/random-id.mts'
import { AUTH_STATE } from '../../helpers/auth-state.mts'
import {
  createTestUser,
  insertTestPost,
  suspendTestUser,
} from '../../../backend/test-helpers/index.mts'

let suspendedUserId = ''
let unsuspendUserId = ''
let suspendedPostId = ''
let regularPostId = ''

test.beforeAll(async () => {
  const random = randomSuffix()
  const usernameSuffix = random.replaceAll(/\d/g, digit => 'abcdefghij'[Number(digit)])

  const suspendedUser = await createTestUser({ username: `susp-e-two-e-${usernameSuffix}` })
  if (!suspendedUser) throw new Error('Failed to create suspended user')
  suspendedUserId = suspendedUser.id

  const regularUser = await createTestUser({ username: `susp-regular-e-two-e-${usernameSuffix}` })
  if (!regularUser) throw new Error('Failed to create regular user')

  // Separate user seeded for the unsuspend test so it doesn't race with the suspended-status assertions
  const unsuspendUser = await createTestUser({ username: `susp-unsuspend-e2e-${usernameSuffix}` })
  if (!unsuspendUser) throw new Error('Failed to create unsuspend user')
  unsuspendUserId = unsuspendUser.id

  suspendedPostId = await insertTestPost({
    createdById: suspendedUser.id,
    title: `Suspended user post ${random}`,
    slug: `susp-post-e2e-${random}`,
    markdown: `This post is from a suspended user ${random}`,
  })

  regularPostId = await insertTestPost({
    createdById: regularUser.id,
    title: `Regular user post ${random}`,
    slug: `regular-post-e2e-${random}`,
    markdown: `This post is from a regular user ${random}`,
  })

  await suspendTestUser(suspendedUser.id)
  await suspendTestUser(unsuspendUser.id)
})

test.describe('User Suspension — Content Visibility', () => {
  test("suspended user's posts are hidden from the public /posts feed", async ({ page }) => {
    await navigateTo(page, '/posts?sort=new')

    // The regular user's post should appear (post links use the post ID in href)
    const regularPostLink = page.locator(`a[href*="${regularPostId}"]`)
    await expect(regularPostLink).not.toHaveCount(0)

    // The suspended user's post should NOT appear
    const suspendedPostLink = page.locator(`a[href*="${suspendedPostId}"]`)
    await expect(suspendedPostLink).toHaveCount(0)
  })

  test("suspended user's profile page still loads", async ({ page }) => {
    await navigateTo(page, `/user/${suspendedUserId}`)

    // Profile page should render (200, not a 404 error page)
    await expect(page.locator('body')).not.toContainText('Page not found')
  })
})

test.describe('User Suspension — Admin Panel', () => {
  test.use({ storageState: AUTH_STATE })

  test('admin can view the user admin panel', async ({ page }) => {
    await navigateTo(page, `/user/${suspendedUserId}/admin`)

    await expect(page.getByTestId('user-administration-title')).toBeVisible()
    await expect(page.getByTestId('user-admin-status-badge')).toBeVisible()
  })

  test('admin sees suspended status badge for suspended user', async ({ page }) => {
    await navigateTo(page, `/user/${suspendedUserId}/admin`)

    await expect(page.getByTestId('user-admin-status-badge')).toContainText('Suspended')
  })

  test('admin can unsuspend a suspended user', async ({ page }) => {
    await navigateTo(page, `/user/${unsuspendUserId}/admin`)

    const unsuspendButton = page.getByTestId('user-admin-unsuspend-button')
    await expect(unsuspendButton).toBeVisible()
    await unsuspendButton.click()

    await expect(page.getByTestId('user-admin-status-badge')).toContainText('Active')
  })
})
