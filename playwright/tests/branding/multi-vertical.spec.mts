import { test, expect } from '../../helpers/test.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'

test.describe('Multi-vertical branding', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 })
  })

  test('homepage: content is domain-agnostic', async ({ page }) => {
    await navigateTo(page, '/')
    await expect(page.getByRole('heading', { level: 1 })).toContainText('The Social Trust Network')
    await expect(page.getByTestId('landing-hero-description')).toContainText('people and sources')
  })

  test('news page: description is domain-agnostic', async ({ page }) => {
    await navigateTo(page, '/news')
    await expect(page.getByTestId('browse-page-description')).toContainText('topics you follow')
  })

  test('posts page: h1 uses all-posts dropdown default', async ({ page }) => {
    await navigateTo(page, '/posts')
    await expect(page.getByRole('heading', { level: 1 })).toContainText('All')
  })

  test('reviews page: h1 is domain-agnostic', async ({ page }) => {
    await navigateTo(page, '/reviews')
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Reviews')
    await expect(page.getByRole('heading', { level: 1 })).not.toContainText('Credit Card')
  })
})
