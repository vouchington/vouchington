import { test, expect } from '../../helpers/test.mts'
import { AUTH_STATE } from '../../helpers/auth-state.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'

test.describe('My Cards', () => {
  test.use({ storageState: AUTH_STATE })

  test.beforeEach(async ({ page }) => {
    await navigateTo(page, '/my/cards')
  })

  test('displays page heading', async ({ page }) => {
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Cards')
  })

  test('displays seeded card', async ({ page }) => {
    await expect(
      page.getByTestId('cards-row-name').filter({ hasText: 'Chase Sapphire Preferred' }).first(),
    ).toBeVisible()
  })

  test('add form is always visible without clicking any button', async ({ page }) => {
    await expect(page.getByTestId('cards-manager')).toBeVisible()
    await expect(page.getByTestId('cards-add-form-heading')).toBeVisible()
  })

  test('shows edit button for each card', async ({ page }) => {
    await expect(page.getByTestId('cards-row-edit-button').first()).toBeVisible()
  })

  test('shows edit form when clicking edit', async ({ page }) => {
    await page.getByTestId('cards-row-edit-button').first().click()
    await expect(page.getByTestId('cards-edit-save-button')).toBeVisible()
    await expect(page.getByTestId('cards-edit-cancel-button')).toBeVisible()
  })

  test('loads more authorized-user parent choices', async ({ page }) => {
    await page.getByTestId('cards-row-edit-button').first().click()
    const authorizedUser = page.getByRole('checkbox', { name: 'Authorized user', exact: true })
    await authorizedUser.click()
    await expect(authorizedUser).toHaveAttribute('data-state', 'checked')

    const loadMoreParents = page.getByTestId('cards-parent-load-more')
    await expect(loadMoreParents).toBeVisible()
    await loadMoreParents.click()
    await expect(loadMoreParents).toHaveCount(0)
  })

  test('can cancel editing a card', async ({ page }) => {
    await page.getByTestId('cards-row-edit-button').first().click()
    await page.getByTestId('cards-edit-cancel-button').click()
    await expect(page.getByTestId('cards-add-form-heading')).toBeVisible()
  })

  test('responsive layout on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 })
    await navigateTo(page, '/my/cards')
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Cards')
    await expect(
      page.getByTestId('cards-row-name').filter({ hasText: 'Chase Sapphire Preferred' }).first(),
    ).toBeVisible()
  })
})
