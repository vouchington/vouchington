import { test, expect } from '../../helpers/test.mts'
import { MOBILE_VIEWPORTS, navigateTo } from 'vouchington-tooling/playwright'

test.describe('Footer links', () => {
  test('About, Terms, and Privacy links point to article routes', async ({ page }) => {
    await navigateTo(page, '/')

    const aboutLink = page.getByTestId('footer-site-link-about')
    const termsLink = page.getByTestId('footer-site-link-terms')
    const privacyLink = page.getByTestId('footer-site-link-privacy')
    const copyrightLink = page.getByTestId('footer-site-link-copyright')

    await expect(aboutLink).toHaveAttribute('href', '/article/about')
    await expect(termsLink).toHaveAttribute('href', '/article/terms-of-service')
    await expect(privacyLink).toHaveAttribute('href', '/article/privacy-policy')
    await expect(copyrightLink).toHaveAttribute('href', '/copyright')
  })

  test('Copyright footer link remains usable on mobile', async ({ page }) => {
    await page.setViewportSize(MOBILE_VIEWPORTS['iphone-se'])
    await navigateTo(page, '/')

    await page.getByTestId('sidebar-trigger').click()

    const copyrightLink = page.getByTestId('footer-site-link-copyright')
    await expect(copyrightLink).toHaveAttribute('href', '/copyright')
    await copyrightLink.click()
    await expect(page).toHaveURL(/\/copyright$/)
  })
})
