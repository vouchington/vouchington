import { test } from '../../helpers/test.mts'
import { AUTH_STATE } from '../../helpers/auth-state.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
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
    await assertManagerHeading(page, 'point-valuations-heading', 'Point Valuations')
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

  test('responsive layout on mobile', async ({ page }) => {
    await useIphoneSeViewport(page)
    await navigateTo(page, '/my/rewards-program-point-valuations')
    await assertManagerHeading(page, 'point-valuations-heading', 'Point Valuations')
    await assertSeededName(page, 'point-valuation-program-name', 'Chase Ultimate Rewards')
  })
})
