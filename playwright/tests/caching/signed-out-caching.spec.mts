import { navigateTo } from '../../helpers/navigate-to.mts'
import { test, expect } from '../../helpers/test.mts'

test.describe('Signed-out caching', () => {
  test('signed-out theme preference works via localStorage', async ({ page }) => {
    await navigateTo(page, '/')

    await page.evaluate(() => {
      localStorage.setItem('theme', 'dark')
    })
    await page.reload()

    await expect(page.locator('html')).toHaveClass(/dark/)
  })

  test('theme persists across navigations for signed-out user', async ({ page }) => {
    await navigateTo(page, '/')

    await page.evaluate(() => {
      localStorage.setItem('theme', 'dark')
    })
    await page.reload()

    await expect(page.locator('html')).toHaveClass(/dark/)

    // Navigate to another page
    await navigateTo(page, '/login')

    await expect(page.locator('html')).toHaveClass(/dark/)
  })

  test('no personalization cookies set for signed-out user', async ({ page, context }) => {
    await navigateTo(page, '/')

    // Change theme via localStorage
    await page.evaluate(() => {
      localStorage.setItem('theme', 'dark')
      localStorage.setItem('list-style', 'compact')
    })
    await page.reload()

    const cookies = await context.cookies()
    const cookiesByName = new Map(cookies.map(c => [c.name, c]))
    const prefCookieNames = ['theme', 'list-style', 'feed-style']
    for (const name of prefCookieNames) {
      expect(cookiesByName.get(name)).toBeUndefined()
    }
  })
})
