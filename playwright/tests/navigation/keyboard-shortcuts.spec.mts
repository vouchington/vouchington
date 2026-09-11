import { test, expect } from '../../helpers/test.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { AUTH_STATE } from '../../helpers/auth-state.mts'

test.describe('Keyboard shortcuts — sidebar (Cmd+/)', () => {
  test('Cmd+/ toggles sidebar closed and open', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 })
    await navigateTo(page, '/')

    const sidebarPeer = page.getByTestId('sidebar-peer')
    await expect(sidebarPeer).toHaveAttribute('data-state', 'expanded')

    await page.keyboard.press('ControlOrMeta+/')
    await expect(sidebarPeer).toHaveAttribute('data-state', 'collapsed')

    await page.keyboard.press('ControlOrMeta+/')
    await expect(sidebarPeer).toHaveAttribute('data-state', 'expanded')
  })
})

test.describe('Keyboard shortcuts — settings (Cmd+.)', () => {
  test.use({ storageState: AUTH_STATE })

  test('Cmd+. navigates to preferences for authenticated user', async ({ page }) => {
    await navigateTo(page, '/')

    await page.keyboard.press('ControlOrMeta+.')
    await expect(page).toHaveURL(/\/my\/preferences/)
  })

  test('Cmd+. does nothing for unauthenticated user', async ({ page }) => {
    await navigateTo(page, '/')
    const initialUrl = page.url()

    await page.keyboard.press('ControlOrMeta+.')
    // URL should not have changed to preferences
    await expect(page).not.toHaveURL(/\/my\/preferences/)
    expect(page.url()).toBe(initialUrl)
  })
})

test.describe('Keyboard shortcuts — shortcuts dialog (?)', () => {
  test('? opens keyboard shortcuts dialog', async ({ page }) => {
    await navigateTo(page, '/')

    await page.keyboard.press('?')

    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await expect(page.getByTestId('keyboard-shortcuts-title')).toBeVisible()
  })

  test('dialog contains all shortcut descriptions', async ({ page }) => {
    await navigateTo(page, '/')
    await page.keyboard.press('?')

    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()

    await expect(page.getByTestId('shortcut-item-search')).toContainText('search dialog')
    await expect(page.getByTestId('shortcut-item-sidebar')).toContainText('sidebar')
    await expect(page.getByTestId('shortcut-item-settings')).toContainText('preferences')
    await expect(page.getByTestId('shortcut-item-shortcuts-help')).toContainText('shortcuts dialog')
  })

  test('dialog contains link to /article/keyboard-shortcuts page', async ({ page }) => {
    await navigateTo(page, '/')
    await page.keyboard.press('?')

    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()

    const link = page.getByTestId('view-all-shortcuts-link')
    await expect(link).toBeVisible()
    await expect(link).toHaveAttribute('href', '/article/keyboard-shortcuts')
  })

  test('Escape closes shortcuts dialog', async ({ page }) => {
    await navigateTo(page, '/')
    await page.keyboard.press('?')

    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()

    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
  })

  test('? does not open dialog when typing in search input', async ({ page }) => {
    await navigateTo(page, '/')

    // Open search dialog first
    await page.keyboard.press('ControlOrMeta+k')
    const searchDialog = page.getByRole('dialog')
    await expect(searchDialog).toBeVisible()

    // Type ? in the search input — should not open a second dialog
    const input = page.getByTestId('search-input')
    await input.pressSequentially('?')

    // Close the search dialog
    await page.keyboard.press('Escape')
    await expect(searchDialog).toBeHidden()

    // No shortcuts dialog should be open
    await expect(page.getByRole('dialog')).toBeHidden()
  })
})
