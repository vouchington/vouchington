import { test, expect } from '../../helpers/test.mts'
import { AUTH_STATE } from '../../helpers/auth-state.mts'
import { navigateTo } from 'vouchington-tooling/playwright'
import {
  clearManagerInputWithFill,
  clickFirstManagerControl,
  clickManagerControl,
  assertExactValue,
  assertFirstManagerControlVisible,
  assertManagerControlVisible,
  assertManagerErrorToast,
  assertManagerHeading,
  assertSeededName,
  useIphoneSeViewport,
} from '../../helpers/authenticated-manager-page.mts'

test.describe('My Point Valuations', () => {
  test.use({ storageState: AUTH_STATE })

  test.beforeEach(async ({ page }) => {
    await navigateTo(page, '/my/rewards-program-point-valuations')
  })

  test('displays page heading', async ({ page }) => {
    await assertManagerHeading(page, 'settings-page-header-title', 'Point Valuations')
  })

  test('displays seeded point valuation', async ({ page }) => {
    await assertSeededName(page, 'point-valuation-program-name', 'Chase Ultimate Rewards')
  })

  test('displays currency-aware value per point', async ({ page }) => {
    await assertExactValue(page, 'point-valuation-cpp-display', '$0.02 per point')
  })

  test('add form is always visible without clicking any button', async ({ page }) => {
    await assertManagerControlVisible(page, 'point-valuations-manager')
    await assertManagerControlVisible(page, 'point-valuations-add-form-heading')
    await assertManagerControlVisible(page, 'point-valuations-add-cpp-label')
  })

  test('shows edit button', async ({ page }) => {
    await assertFirstManagerControlVisible(page, 'point-valuation-edit-button')
  })

  test('edit form validates empty value per point', async ({ page }) => {
    await clickFirstManagerControl(page, 'point-valuation-edit-button')
    await clearManagerInputWithFill(page, 'point-valuation-edit-cpp-input')
    await clickManagerControl(page, 'point-valuation-edit-save-button')
    await assertManagerErrorToast(page, 'Please enter a valid value per point')
  })

  test('shows edit cancel, remove confirmation and add submit controls', async ({ page }) => {
    await expect(page.getByTestId('add-valuation-form-add')).toBeAttached()
    await page.getByTestId('point-valuation-edit-button').first().click()
    await expect(page.getByTestId('valuation-list-cancel')).toBeVisible()
    await page.getByTestId('valuation-list-cancel').click()
    await page.getByTestId('valuation-summary-remove').first().click()
    await expect(page.getByTestId('valuation-summary-confirm')).toBeVisible()
    await expect(page.getByTestId('valuation-summary-cancel')).toBeVisible()
  })

  test('responsive layout on mobile', async ({ page }) => {
    await useIphoneSeViewport(page)
    await navigateTo(page, '/my/rewards-program-point-valuations')
    await assertManagerHeading(page, 'settings-page-header-title', 'Point Valuations')
    await assertSeededName(page, 'point-valuation-program-name', 'Chase Ultimate Rewards')
  })
})
