import { randomUUID } from 'node:crypto'
import { test, expect } from '../../helpers/test.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { AUTH_STATE } from '../../helpers/auth-state.mts'
import { requireTestValue } from '../../helpers/assertions.mts'
import {
  createTestUser,
  insertTestPost,
  insertTestVoteIntegrityFlag,
  insertTestVoteWeightPenaltyRecord,
} from '../../../backend/test-helpers/index.mts'

const TEST_ADMIN_ID = '019f0000-0000-7000-8000-000000000000'

test.describe('Admin Vote Integrity', () => {
  test.use({ storageState: AUTH_STATE })

  test('browses only flag-sourced vote penalties and revokes one', async ({ page }) => {
    const penalizedUser = requireTestValue(
      await createTestUser(),
      'Failed to create penalized user',
    )
    const postSuffix = randomUUID()
    const postId = await insertTestPost({
      title: `Vote integrity penalty ${postSuffix}`,
      slug: `vote-integrity-penalty-${postSuffix}`,
      createdById: TEST_ADMIN_ID,
      markdown: 'Vote integrity penalty browser fixture.',
    })
    const flagId = await insertTestVoteIntegrityFlag({ postId })
    const penaltyId = await insertTestVoteWeightPenaltyRecord({
      userId: penalizedUser.id,
      createdById: TEST_ADMIN_ID,
      sourceFlagId: flagId,
    })

    await navigateTo(page, '/vote-integrity/flags')
    await page.getByTestId('vote-integrity-penalties-tab').click()
    await expect(page).toHaveURL(/\/vote-integrity\/penalties$/)
    await expect(page.getByTestId('vote-integrity-penalties-heading')).toBeVisible()
    await expect(page.getByTestId('vote-integrity-penalties-status-filter')).toBeVisible()
    await expect(page.getByTestId('vote-integrity-flags-tab')).toBeVisible()
    const row = page.locator(`[data-integrity-penalty-id="${penaltyId}"]`)
    await expect(row).toBeVisible()
    const revoke = row.getByTestId('vote-integrity-penalty-revoke')
    await revoke.click()
    await expect(revoke).toContainText('Confirm')
    const response = page.waitForResponse(
      candidate =>
        candidate.ok() &&
        candidate.url().endsWith(`/api/v1/vote-integrity/penalties/${penaltyId}`) &&
        candidate.request().method() === 'DELETE',
    )
    await revoke.click()
    await response
    await expect(row).not.toBeAttached()
    await expect(page.getByTestId('vote-integrity-penalty-reconciliation')).toHaveCount(0)
    await navigateTo(page, '/vote-integrity/penalties?status=revoked')
    await expect(row).toBeVisible()
    await navigateTo(page, '/vote-integrity/penalties?status=all')
    await expect(row).toBeVisible()
  })

  test('should redirect unauthenticated users to home', async ({ page }) => {
    await page.context().clearCookies()
    await navigateTo(page, '/vote-integrity/flags')
    await expect(page).toHaveURL('/')
  })

  test('should allow admin to access vote integrity flags page', async ({ page }) => {
    await navigateTo(page, '/vote-integrity/flags')

    const heading = page
      .getByRole('heading', { level: 1 })
      .filter({ hasText: 'Vote Integrity Flags' })
    await expect(heading).toBeVisible()
    const loadMoreBtn = page.locator('button').filter({ hasText: 'Load More' })
    await expect(loadMoreBtn).toHaveCount(0)
  })

  test('should show status filter selector', async ({ page }) => {
    await navigateTo(page, '/vote-integrity/flags')

    const statusFilter = page.getByTestId('vote-integrity-flags-status-filter')
    await expect(statusFilter).toBeVisible()
    await expect(statusFilter).toHaveAccessibleName('Filter flags by status')
  })

  test('should show Vote Integrity link in admin sidebar', async ({ page }) => {
    await navigateTo(page, '/vote-integrity/flags')

    const sidebar = page.locator('[data-sidebar="sidebar"]')
    const link = sidebar.locator('a').filter({ hasText: 'Vote Integrity' })
    await expect(link).toBeVisible()
  })
})
