import { navigateTo } from '../../helpers/navigate-to.mts'
import { test, expect } from '../../helpers/test.mts'
import { AUTH_STATE } from '../../helpers/auth-state.mts'

test.describe('Global Search', () => {
  test('should open search dialog with Cmd+K', async ({ page }) => {
    await navigateTo(page, '/')

    // Press Cmd+K (or Ctrl+K on Windows/Linux)
    await page.keyboard.press('ControlOrMeta+k')

    // Search dialog should be visible
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await expect(page.getByTestId('search-input')).toBeVisible()
  })

  test('should open search dialog by clicking search button', async ({ page }) => {
    await navigateTo(page, '/')

    await page.getByTestId('navbar-search-button').click()

    // Search dialog should be visible
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
  })

  test('should close search dialog on Escape', async ({ page }) => {
    await navigateTo(page, '/')
    await page.keyboard.press('ControlOrMeta+k')

    // Dialog should be open
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()

    // Press Escape
    await page.keyboard.press('Escape')

    // Dialog should be closed
    await expect(dialog).toBeHidden()
  })
})

test.describe('Search tabs', () => {
  test('renders tabs in order: All, Topics, Communities, Posts, News, Domains, Pages', async ({
    page,
  }) => {
    await navigateTo(page, '/')
    await page.keyboard.press('ControlOrMeta+k')

    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()

    await expect(page.getByTestId('search-tab-all')).toHaveText('All')
    await expect(page.getByTestId('search-tab-topics')).toHaveText('Topics')
    await expect(page.getByTestId('search-tab-communities')).toHaveText('Communities')
    await expect(page.getByTestId('search-tab-posts')).toHaveText('Posts')
    await expect(page.getByTestId('search-tab-news')).toHaveText('News')
    await expect(page.getByTestId('search-tab-domains')).toHaveText('Domains')
    await expect(page.getByTestId('search-tab-pages')).toHaveText('Pages')
  })

  test('All tab is active by default', async ({ page }) => {
    await navigateTo(page, '/')
    await page.keyboard.press('ControlOrMeta+k')

    const allButton = page.getByTestId('search-tab-all')
    await expect(allButton).toHaveAttribute('aria-pressed', 'true')

    const topicsButton = page.getByTestId('search-tab-topics')
    await expect(topicsButton).toHaveAttribute('aria-pressed', 'false')
  })

  test('clicking Communities tab changes active state', async ({ page }) => {
    await navigateTo(page, '/')
    await page.keyboard.press('ControlOrMeta+k')

    await page.getByTestId('search-tab-communities').click()
    await expect(page.getByTestId('search-tab-communities')).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByTestId('search-tab-all')).toHaveAttribute('aria-pressed', 'false')
  })

  test('clicking tab changes active state', async ({ page }) => {
    await navigateTo(page, '/')
    await page.keyboard.press('ControlOrMeta+k')

    // Click Domains tab
    await page.getByTestId('search-tab-domains').click()
    await expect(page.getByTestId('search-tab-domains')).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByTestId('search-tab-all')).toHaveAttribute('aria-pressed', 'false')
  })

  test('tabs reset to All when dialog closes and reopens', async ({ page }) => {
    await navigateTo(page, '/')
    await page.keyboard.press('ControlOrMeta+k')

    const dialog = page.getByRole('dialog')

    // Switch to Posts tab
    await page.getByTestId('search-tab-posts').click()
    await expect(page.getByTestId('search-tab-posts')).toHaveAttribute('aria-pressed', 'true')

    // Close and reopen
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    await page.keyboard.press('ControlOrMeta+k')
    await expect(dialog).toBeVisible()

    // Should be back to All
    await expect(page.getByTestId('search-tab-all')).toHaveAttribute('aria-pressed', 'true')
  })
})

test.describe('Page shortcuts', () => {
  test('shows Sources page shortcut when searching "sources"', async ({ page }) => {
    await navigateTo(page, '/')
    await page.keyboard.press('ControlOrMeta+k')

    const input = page.getByTestId('search-input')
    await input.pressSequentially('sources')

    // Should show page shortcut
    await expect(page.getByTestId('search-page-shortcut-sources')).toBeVisible({ timeout: 5000 })
  })

  test('page shortcut is a real anchor with correct href', async ({ page }) => {
    await navigateTo(page, '/')
    await page.keyboard.press('ControlOrMeta+k')

    const input = page.getByTestId('search-input')
    await input.pressSequentially('sources')

    await expect(page.getByTestId('search-page-shortcut-sources')).toBeVisible({ timeout: 5000 })
    await expect(page.getByTestId('search-page-shortcut-sources')).toHaveAttribute(
      'href',
      '/sources',
    )
  })

  test('Cmd+click on page shortcut opens new tab without navigating current page', async ({
    page,
  }) => {
    await navigateTo(page, '/')
    const originalUrl = page.url()

    await page.keyboard.press('ControlOrMeta+k')
    const input = page.getByTestId('search-input')
    await input.pressSequentially('sources')
    await expect(page.getByTestId('search-page-shortcut-sources')).toBeVisible({ timeout: 5000 })

    const popupPromise = page.context().waitForEvent('page')
    await page.getByTestId('search-page-shortcut-sources').click({ modifiers: ['ControlOrMeta'] })
    const popup = await popupPromise

    await expect(popup).toHaveURL(/\/sources$/)
    // Current tab stays on the original page
    expect(page.url()).toBe(originalUrl)
  })

  test('shows News page shortcut when searching "news"', async ({ page }) => {
    await navigateTo(page, '/')
    await page.keyboard.press('ControlOrMeta+k')

    const input = page.getByTestId('search-input')
    await input.pressSequentially('news')

    await expect(page.getByTestId('search-page-shortcut-news')).toBeVisible({ timeout: 5000 })
  })

  test('shows multiple matching shortcuts', async ({ page }) => {
    await navigateTo(page, '/')
    await page.keyboard.press('ControlOrMeta+k')

    const input = page.getByTestId('search-input')
    // "do" matches "Domains"
    await input.pressSequentially('do')

    await expect(page.getByTestId('search-page-shortcut-domains')).toBeVisible({ timeout: 5000 })
  })
})

test.describe('Pages tab', () => {
  test('Pages tab shows page shortcuts', async ({ page }) => {
    await navigateTo(page, '/')
    await page.keyboard.press('ControlOrMeta+k')

    await page.getByTestId('search-tab-pages').click()
    await expect(page.getByTestId('search-tab-pages')).toHaveAttribute('aria-pressed', 'true')

    const input = page.getByTestId('search-input')
    await input.pressSequentially('sources')

    await expect(page.getByTestId('search-page-shortcut-sources')).toBeVisible({ timeout: 5000 })
  })

  test('Posts tab does not show Pages section', async ({ page }) => {
    await navigateTo(page, '/')
    await page.keyboard.press('ControlOrMeta+k')

    await page.getByTestId('search-tab-posts').click()
    await expect(page.getByTestId('search-tab-posts')).toHaveAttribute('aria-pressed', 'true')

    const input = page.getByTestId('search-input')
    // "cards" matches the Cards page shortcut (/cards)
    await input.pressSequentially('cards')

    // The Pages section should NOT appear when Posts tab is active
    await expect(page.getByTestId('search-page-shortcut-cards')).toBeHidden()
  })

  test('Pages tab shows no Topics, Posts, News, or Domains groups', async ({ page }) => {
    await navigateTo(page, '/')
    await page.keyboard.press('ControlOrMeta+k')

    await page.getByTestId('search-tab-pages').click()

    const input = page.getByTestId('search-input')
    await input.pressSequentially('a')

    // API result group headings should not appear in the Pages tab
    await expect(page.getByTestId('search-group-topics')).toBeHidden()
    await expect(page.getByTestId('search-group-posts')).toBeHidden()
    await expect(page.getByTestId('search-group-news')).toBeHidden()
    await expect(page.getByTestId('search-group-domains')).toBeHidden()
    await expect(page.getByTestId('search-group-communities')).toBeHidden()
  })
})

test.describe('Admin page shortcuts', () => {
  test.use({ storageState: AUTH_STATE })

  test('admin user sees Queues shortcut when searching "queues"', async ({ page }) => {
    await navigateTo(page, '/')
    await page.keyboard.press('ControlOrMeta+k')

    const input = page.getByTestId('search-input')
    await input.pressSequentially('queues')

    await expect(page.getByTestId('search-page-shortcut-admin-queues')).toBeVisible({
      timeout: 5000,
    })
  })

  test('admin user sees CRM shortcut when searching "crm"', async ({ page }) => {
    await navigateTo(page, '/')
    await page.keyboard.press('ControlOrMeta+k')

    const input = page.getByTestId('search-input')
    await input.pressSequentially('crm')

    await expect(page.getByTestId('search-page-shortcut-crm')).toBeVisible({ timeout: 5000 })
  })

  test('unauthenticated user does not see admin shortcuts', async ({ page }) => {
    // Logged out user should not see admin shortcuts
    await page.context().clearCookies()
    await navigateTo(page, '/')
    await page.keyboard.press('ControlOrMeta+k')

    const input = page.getByTestId('search-input')
    await input.pressSequentially('queues')

    // Should NOT have admin page shortcuts
    await expect(page.getByTestId('search-page-shortcut-admin-queues')).toBeHidden()
  })
})
