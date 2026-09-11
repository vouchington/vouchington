import { test, expect } from '../../helpers/test.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { AUTH_STATE } from '../../helpers/auth-state.mts'
import { requireTestValue } from '../../helpers/assertions.mts'
import {
  createTestUser,
  insertTestReportAbusePenalty,
  insertTestReportIntegrityFlag,
  getTestReportAbusePenaltiesByFlagId,
} from '../../../backend/test-helpers/index.mts'

test.describe('Admin Report Integrity', () => {
  test.use({ storageState: AUTH_STATE })

  test('browses and revokes report integrity penalties', async ({ page }) => {
    const penalizedUser = requireTestValue(
      await createTestUser(),
      'Failed to create penalized user',
    )
    const flagId = await insertTestReportIntegrityFlag({ reportedUserId: penalizedUser.id })
    const penaltyId = await insertTestReportAbusePenalty({
      userId: penalizedUser.id,
      createdById: '019f0000-0000-7000-8000-000000000000',
      sourceFlagId: flagId,
    })

    await navigateTo(page, '/report-integrity/flags')
    await page.getByTestId('report-integrity-penalties-tab').click()
    await expect(page).toHaveURL(/\/report-integrity\/penalties$/)
    await expect(page.getByTestId('report-integrity-penalties-heading')).toBeVisible()
    await expect(page.getByTestId('report-integrity-penalties-status-filter')).toBeVisible()
    await expect(page.getByTestId('report-integrity-flags-tab')).toBeVisible()
    const row = page.locator(`[data-integrity-penalty-id="${penaltyId}"]`)
    await expect(row).toBeVisible()
    const revoke = row.getByTestId('report-integrity-penalty-revoke')
    await revoke.click()
    await expect(revoke).toContainText('Confirm')
    const response = page.waitForResponse(
      candidate =>
        candidate.ok() &&
        candidate.url().endsWith(`/api/v1/report-integrity/penalties/${penaltyId}`) &&
        candidate.request().method() === 'DELETE',
    )
    await revoke.click()
    await response
    await expect(row).not.toBeAttached()
    await expect(page.getByTestId('report-integrity-penalty-reconciliation')).toHaveCount(0)
    await navigateTo(page, '/report-integrity/penalties?status=revoked')
    await expect(row).toBeVisible()
    await navigateTo(page, '/report-integrity/penalties?status=all')
    await expect(row).toBeVisible()
  })

  test('should redirect unauthenticated users to home', async ({ page }) => {
    await page.context().clearCookies()
    await navigateTo(page, '/report-integrity/flags')
    await expect(page).toHaveURL('/')
  })

  test('should allow admin to access report integrity flags page', async ({ page }) => {
    await navigateTo(page, '/report-integrity/flags')

    await expect(page.getByTestId('report-integrity-flags-heading')).toBeVisible()
  })

  test('should show status filter on report integrity flags page', async ({ page }) => {
    await navigateTo(page, '/report-integrity/flags')

    // Use aria-label to discriminate the header status-filter combobox from row-level
    // resolution selects seeded by parallel action tests.
    await expect(page.getByLabel('Filter flags by status')).toBeVisible()
  })
})

test.describe('Admin Report Integrity — flag actions', () => {
  test.use({ storageState: AUTH_STATE })

  test('admin can resolve/dismiss a report integrity flag', async ({ page }) => {
    // Seed a fresh user and flag — report_integrity_flags requires exactly one entity FK (num_nonnulls = 1)
    const reportedUser = requireTestValue(await createTestUser(), 'Failed to create reported user')
    const flagId = await insertTestReportIntegrityFlag({
      reportedUserId: reportedUser.id,
      reporterCount: 3,
      newAccountReporterPct: 0.8,
    })

    await navigateTo(page, '/report-integrity/flags')
    await expect(page.getByTestId('report-integrity-flags-heading')).toBeVisible()

    // Scope to the seeded flag's row
    const flagRow = page.locator(`[data-report-integrity-flag-id="${flagId}"]`)
    await expect(flagRow).toBeVisible()

    // Open the resolution select and pick Dismiss
    const resolutionSelect = flagRow.getByTestId('report-integrity-resolution-select')
    await expect(resolutionSelect).toBeVisible()
    await resolutionSelect.click()
    await page.getByRole('listbox').getByRole('option', { name: 'Dismiss' }).click()

    // Click Resolve
    const resolveBtn = flagRow.getByTestId('report-integrity-resolve')
    await expect(resolveBtn).toBeEnabled()
    const resolveResponse = page.waitForResponse(
      resp =>
        resp.url().includes('/api/v1/report-integrity/flags') &&
        resp.request().method() === 'PATCH',
    )
    await resolveBtn.click()
    await resolveResponse

    // The row should now show resolved state (action buttons gone)
    await expect(flagRow.getByTestId('report-integrity-resolve')).not.toBeAttached()
    await expect(page.getByTestId('report-integrity-flag-reconciliation')).toHaveCount(0)
  })

  test('admin can investigate a report integrity flag', async ({ page }) => {
    // Seed reporter users — applyReportAbusePenalty reads details.reporter_user_ids
    const reporter1 = await createTestUser()
    const reporter2 = await createTestUser()
    const reportedUser = requireTestValue(await createTestUser(), 'Failed to create reported user')
    const flagId = await insertTestReportIntegrityFlag({
      reportedUserId: reportedUser.id,
      reporterCount: 2,
      newAccountReporterPct: 0.9,
      reporterUserIds: [
        requireTestValue(reporter1, 'Failed to create first reporter').id,
        requireTestValue(reporter2, 'Failed to create second reporter').id,
      ],
    })

    await navigateTo(page, '/report-integrity/flags')

    const flagRow = page.locator(`[data-report-integrity-flag-id="${flagId}"]`)
    await expect(flagRow).toBeVisible()

    const investigateBtn = flagRow.getByTestId('report-integrity-investigate')
    await expect(investigateBtn).toBeVisible()

    // First click shows the confirm state ('Confirm?')
    await investigateBtn.click()
    await expect(investigateBtn).toContainText('Confirm?')

    // Second click triggers the investigation
    const investigateResponse = page.waitForResponse(
      resp =>
        resp.url().includes('/api/v1/report-integrity/flags') &&
        resp.url().includes('/penalties') &&
        resp.request().method() === 'POST',
    )
    await investigateBtn.click()
    await investigateResponse

    // The active queue removes the authoritative flag after the penalty action resolves it.
    await expect(flagRow).not.toBeAttached()

    // Assert penalties were actually created for the seeded reporters
    const penalties = await getTestReportAbusePenaltiesByFlagId(flagId)
    expect(penalties).toHaveLength(2)
  })
})
