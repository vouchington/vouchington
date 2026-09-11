import { expect, test } from '../../helpers/test.mts'
import { AUTH_STATE } from '../../helpers/auth-state.mts'
import { createTestUser, insertTestPost } from '../../../backend/test-helpers/index.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { randomSuffix } from '../../helpers/random-id.mts'
import { waitForBelowFoldHydration } from '../../helpers/wait-for-hydration.mts'

let targetUserId = ''
let targetPostId = ''

test.beforeAll(async () => {
  const suffix = randomSuffix()

  const target = await createTestUser({ username: `rpt-submit-target-${suffix}` })
  if (!target) throw new Error('Failed to create target user')
  targetUserId = target.id

  targetPostId = await insertTestPost({
    title: `Report submit test post ${suffix}`,
    slug: `rpt-submit-post-${suffix}`,
    createdById: target.id,
    markdown: 'Post used for report submit test.',
  })
})

test.describe('Report submission', () => {
  test.use({ storageState: AUTH_STATE })

  test('user submits report on another user profile', async ({ page }) => {
    await navigateTo(page, `/user/${targetUserId}`)

    const reportButton = page.getByTestId('report-inline-button').first()
    await expect(reportButton).toBeVisible({ timeout: 10_000 })
    await reportButton.click()

    const dialog = page.getByTestId('report-dialog')
    await expect(dialog).toBeVisible()

    const spamRadio = page.getByTestId('report-reason-spam')
    await expect(spamRadio).toBeVisible()
    await spamRadio.click()

    const submitButton = page.getByTestId('report-submit')
    await expect(submitButton).toBeEnabled()
    await submitButton.click()

    await expect(dialog.getByTestId('report-success-message')).toBeVisible()
  })

  test('user submits report on a post via dedicated report button', async ({ page }) => {
    await navigateTo(page, `/discussion/${targetPostId}`)

    await waitForBelowFoldHydration(page)
    // Open the unified overflow kebab to access the report item
    const overflowTrigger = page.getByTestId('post-detail-overflow-trigger')
    await expect(overflowTrigger).toBeVisible({ timeout: 10_000 })
    await overflowTrigger.click()

    const reportMenuItem = page.getByTestId('report-menu-item')
    await expect(reportMenuItem).toBeVisible()
    await reportMenuItem.click()

    const dialog = page.getByTestId('report-dialog')
    await expect(dialog).toBeVisible()

    const spamRadio = page.getByTestId('report-reason-spam')
    await expect(spamRadio).toBeVisible()
    await spamRadio.click()

    const submitButton = page.getByTestId('report-submit')
    await expect(submitButton).toBeEnabled()
    await submitButton.click()

    await expect(dialog.getByTestId('report-success-message')).toBeVisible()
  })
})
