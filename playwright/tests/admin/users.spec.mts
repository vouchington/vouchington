import { test, expect } from '../../helpers/test.mts'
import { loginAsAdmin, loginAsUser } from '../../helpers/auth.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { randomSuffix } from '../../helpers/random-id.mts'
import { createTestLandingPage, createTestUser } from '../../../backend/test-helpers/index.mts'

let targetId = ''
let targetUsername = ''
let targetEmail = ''
let landingPageId = ''
let viewerId = ''

test.beforeAll(async () => {
  const suffix = randomSuffix()
  const target = await createTestUser({ username: `users-search-${suffix}` })
  if (!target) throw new Error('Failed to create target user')
  targetId = target.id
  targetUsername = target.username!
  targetEmail = target.email_address!
  const landingPage = await createTestLandingPage(targetId, `users-admin-${suffix}`)
  landingPageId = landingPage.landingPageId

  const viewer = await createTestUser({ username: `users-viewer-${suffix}` })
  if (!viewer) throw new Error('Failed to create viewer user')
  viewerId = viewer.id
})

test.describe('Users search and admin management', () => {
  test('signed-in users can search users without admin options', async ({ page }) => {
    await loginAsUser(page, viewerId)
    await navigateTo(page, '/users')

    await page.getByTestId('client-search-input').fill(targetUsername)
    await page.getByTestId('client-search-submit').click()

    await expect(page).toHaveURL(new RegExp(`/users\\?q=${targetUsername}`))
    const userCard = page.getByTestId(`user-card-${targetId}`)
    await expect(userCard.getByTestId('user-card-link')).toBeVisible()
    await expect(userCard.getByTestId('user-card-manage-link')).toHaveCount(0)
    await expect(userCard.getByTestId('user-card-email')).toHaveCount(0)
  })

  test('admins can find a user by email and suspend then unsuspend them', async ({ page }) => {
    await loginAsAdmin(page)
    await navigateTo(page, '/users')

    await page.getByTestId('client-search-input').fill(targetEmail)
    await page.getByTestId('client-search-submit').click()

    const userCard = page.getByTestId(`user-card-${targetId}`)
    await expect(userCard.getByTestId('user-card-link')).toBeVisible()
    await expect(userCard.getByTestId('user-card-email')).toHaveText(targetEmail)
    await expect(userCard.getByTestId('user-card-status')).toHaveText('Active')

    await userCard.getByTestId('user-card-manage-link').click()
    await expect(page).toHaveURL(new RegExp(`/user/${targetUsername}/admin`))
    await expect(page.getByTestId('user-administration-title')).toBeVisible()
    await expect(page.getByTestId('user-admin-grant-identity-attempt-button')).toBeVisible()
    await expect(page.getByTestId('admin-user-landing-page')).toBeVisible()
    await expect(page.getByTestId('admin-user-landing-page-analytics-link')).toHaveAttribute(
      'href',
      `/admin/landing-pages/${landingPageId}/analytics`,
    )

    const suspendResponse = await page.evaluate(async userId => {
      const response = await fetch(`/api/v1/users/${userId}/suspension`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'playwright moderation check' }),
      })
      return { ok: response.ok, status: response.status, body: await response.json() }
    }, targetId)
    expect(suspendResponse).toMatchObject({
      ok: true,
      status: 200,
      body: { user: { suspended_reason: 'playwright moderation check' } },
    })

    await page.reload()
    await expect(page.getByTestId('user-admin-status-badge')).toHaveText('Suspended')
    await expect(page.getByTestId('user-admin-suspended-reason')).toHaveText(
      'playwright moderation check',
    )

    const unsuspendResponse = await page.evaluate(async userId => {
      const response = await fetch(`/api/v1/users/${userId}/suspension`, { method: 'DELETE' })
      return { ok: response.ok, status: response.status, body: await response.json() }
    }, targetId)
    expect(unsuspendResponse).toMatchObject({
      ok: true,
      status: 200,
      body: { user: { suspended_at: null, suspended_reason: null } },
    })

    await page.reload()
    await expect(page.getByTestId('user-admin-status-badge')).toHaveText('Active')
  })
})
