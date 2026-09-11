import { expect, test, type Locator } from '../../helpers/test.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { DESKTOP_VIEWPORT, MOBILE_VIEWPORTS } from '../../helpers/viewport-constants.mts'
import { requireTestValue } from '../../helpers/assertions.mts'
import { collapseSidebar } from '../../helpers/layout-collapse.mts'

async function getRoundedHeight(locator: Locator) {
  const box = await locator.boundingBox()
  expect(box).not.toBeNull()
  return Math.round(box!.height)
}

test.describe('Topbar', () => {
  test('should display topbar with logo and search', async ({ page }) => {
    await navigateTo(page, '/')
    await expect(page.getByTestId('navbar-logo')).toHaveAttribute('href', '/')
    await expect(page.getByTestId('navbar-search-button')).toHaveAttribute(
      'aria-label',
      'Open search',
    )
    await expect(page.locator('[data-sidebar="trigger"]')).toBeAttached()
  })

  test('logo is left-aligned next to sidebar trigger', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 })
    await navigateTo(page, '/')
    await collapseSidebar(page)

    const triggerBox = await page.locator('[data-sidebar="trigger"]').boundingBox()
    const logoBox = await page.getByTestId('navbar-logo').boundingBox()
    const searchBox = await page.getByTestId('navbar-search-button').boundingBox()
    const trigger = requireTestValue(triggerBox, 'Expected sidebar trigger box')
    const logo = requireTestValue(logoBox, 'Expected navbar logo box')
    const search = requireTestValue(searchBox, 'Expected navbar search box')
    expect(trigger.x).toBeLessThan(logo.x)
    expect(logo.x).toBeLessThan(search.x)
    expect(logo.x + logo.width).toBeLessThan(1280 / 4)
  })

  test('should open search dialog on CMD+K', async ({ page }) => {
    await navigateTo(page, '/')
    await page.keyboard.press('ControlOrMeta+k')
    await expect(page.getByRole('dialog')).toBeVisible()
    await expect(page.getByTestId('search-input')).toBeVisible()
    await expect(page.getByTestId('dialog-overlay')).toBeVisible()
  })

  test('should open search dialog on button click', async ({ page }) => {
    await navigateTo(page, '/')
    await page.getByTestId('navbar-search-button').click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await expect(page.getByTestId('dialog-overlay')).toBeVisible()
  })

  test('search control keeps visible text and compact visual height on mobile and desktop', async ({
    page,
  }) => {
    await page.setViewportSize(MOBILE_VIEWPORTS['iphone-se'])
    await navigateTo(page, '/')
    const mobileSearchButton = page.getByTestId('navbar-search-button')
    await expect(mobileSearchButton).toContainText('Search...')
    const mobileButtonBox = await mobileSearchButton.boundingBox()
    expect(mobileButtonBox).not.toBeNull()
    expect(mobileButtonBox!.height).toBeGreaterThanOrEqual(44)
    expect(await getRoundedHeight(page.getByTestId('navbar-search-shell'))).toBe(32)
    await page.setViewportSize(DESKTOP_VIEWPORT)
    await expect(page.getByTestId('navbar-search-button')).toContainText('Search...')
    expect(await getRoundedHeight(page.getByTestId('navbar-search-shell'))).toBe(32)
  })

  test('shows Sign In button for unauthenticated users', async ({ page }) => {
    await navigateTo(page, '/')
    await expect(page.getByTestId('navbar-signin-link')).toHaveAttribute('href', '/login')
  })

  test('shows no profile avatar for unauthenticated users', async ({ page }) => {
    await navigateTo(page, '/')
    await expect(page.getByTestId('navbar-profile-menu-button')).toHaveCount(0)
  })
})
