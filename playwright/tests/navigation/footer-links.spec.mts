import { test, expect } from '../../helpers/test.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { MOBILE_VIEWPORTS } from '../../helpers/viewport-constants.mts'

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

    await expect(page.getByTestId('footer-site-link-copyright')).toHaveAttribute(
      'href',
      '/copyright',
    )
  })
})
