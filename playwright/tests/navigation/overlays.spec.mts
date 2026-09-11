import { test, expect } from '../../helpers/test.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { AUTH_STATE } from '../../helpers/auth-state.mts'

test.describe('Dialog Overlays', () => {
  test.use({ storageState: AUTH_STATE })

  test('command search dialog renders backdrop overlay', async ({ page }) => {
    await navigateTo(page, '/')

    await page.keyboard.press('ControlOrMeta+k')

    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await expect(page.getByTestId('dialog-overlay')).toBeVisible()
  })

  test('command search overlay covers full viewport', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 })
    await navigateTo(page, '/')

    await page.keyboard.press('ControlOrMeta+k')
    await expect(page.getByRole('dialog')).toBeVisible()

    const overlay = page.getByTestId('dialog-overlay')
    await expect(overlay).toBeVisible()

    const overlayBox = await overlay.boundingBox()
    expect(overlayBox).not.toBeNull()
    expect(overlayBox!.x).toBeLessThanOrEqual(0)
    expect(overlayBox!.y).toBeLessThanOrEqual(0)
    expect(overlayBox!.width).toBeGreaterThanOrEqual(1280)
    expect(overlayBox!.height).toBeGreaterThanOrEqual(720)
  })

  test('create a post dialog renders backdrop overlay', async ({ page }) => {
    await navigateTo(page, '/')

    await page.getByTestId('navbar-write-button').click()

    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await expect(page.getByTestId('create-post-dialog-title')).toBeVisible()
    await expect(page.getByTestId('dialog-overlay')).toBeVisible()
  })

  test('create a post overlay covers full viewport', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 })
    await navigateTo(page, '/')

    await page.getByTestId('navbar-write-button').click()
    await expect(page.getByTestId('create-post-dialog-title')).toBeVisible()

    const overlay = page.getByTestId('dialog-overlay')
    await expect(overlay).toBeVisible()

    const overlayBox = await overlay.boundingBox()
    expect(overlayBox).not.toBeNull()
    expect(overlayBox!.x).toBeLessThanOrEqual(0)
    expect(overlayBox!.y).toBeLessThanOrEqual(0)
    expect(overlayBox!.width).toBeGreaterThanOrEqual(1280)
    expect(overlayBox!.height).toBeGreaterThanOrEqual(720)
  })

  test('command search overlay disappears when dialog closes', async ({ page }) => {
    await navigateTo(page, '/')

    await page.keyboard.press('ControlOrMeta+k')
    await expect(page.getByTestId('dialog-overlay')).toBeVisible()

    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toBeHidden()
    await expect(page.getByTestId('dialog-overlay')).toBeHidden()
  })
})
