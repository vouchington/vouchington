import { expect, test } from '../../helpers/test.mts'
import { AUTH_STATE } from '../../helpers/auth-state.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'

const LG_VIEWPORT = { width: 1024, height: 768 }

test.describe('Aside accordion behavior', () => {
  test.use({ storageState: AUTH_STATE })

  test('About Voucha accordion starts open by default', async ({ page }) => {
    await page.setViewportSize(LG_VIEWPORT)
    await navigateTo(page, '/plans')

    const aside = page.locator('main aside')
    await expect(aside.getByTestId('aside-accordion-about-voucha')).toBeVisible()
    const trigger = aside.getByTestId('aside-accordion-about-voucha-trigger')

    await expect(trigger).toBeVisible()
    await expect(trigger).toHaveAttribute('aria-expanded', 'true')
  })

  test('About Voucha accordion closes on click', async ({ page }) => {
    await page.setViewportSize(LG_VIEWPORT)
    await navigateTo(page, '/plans')

    const aside = page.locator('main aside')
    const trigger = aside.getByTestId('aside-accordion-about-voucha-trigger')

    await trigger.click()

    await expect(trigger).toHaveAttribute('aria-expanded', 'false')
  })

  test('About Voucha accordion reopens after close', async ({ page }) => {
    await page.setViewportSize(LG_VIEWPORT)
    await navigateTo(page, '/plans')

    const aside = page.locator('main aside')
    const trigger = aside.getByTestId('aside-accordion-about-voucha-trigger')

    await trigger.click()
    await expect(trigger).toHaveAttribute('aria-expanded', 'false')

    await trigger.click()
    await expect(trigger).toHaveAttribute('aria-expanded', 'true')
  })
})
