import { test, expect } from '../../helpers/test.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { requireTestValue } from '../../helpers/assertions.mts'

test.describe('Domains Page', () => {
  test('displays domains listing with heading and description', async ({ page }) => {
    await navigateTo(page, '/domains')

    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expect(page.getByTestId('page-header-description')).toBeVisible()
  })

  test('does not show Top URLs on domain list cards', async ({ page }) => {
    await navigateTo(page, '/domains')

    await expect(page.getByTestId('domain-detail-top-urls-heading')).toHaveCount(0)
  })

  test('vote buttons appear inside domain cards, not floated right', async ({ page }) => {
    await navigateTo(page, '/domains')

    // Unsigned /domains renders the hostname vote widget as a sign-in control
    // (`hostname-vouch-disavow-vote` / `-sign-in`), not a signed-in semantic trigger.
    const anyVoteWidget = page.getByTestId('hostname-vouch-disavow-vote')
    await expect(anyVoteWidget).not.toHaveCount(0)

    const cardWithVouchButton = page
      .getByRole('article')
      .filter({ has: page.getByTestId('hostname-vouch-disavow-vote') })
      .first()
    await expect(cardWithVouchButton).toBeVisible()

    const vouchButton = cardWithVouchButton
      .getByTestId('hostname-vouch-disavow-vote-sign-in')
      .first()
    await expect(vouchButton).toBeVisible()

    const cardBox = await cardWithVouchButton.boundingBox()
    const buttonBox = await vouchButton.boundingBox()

    const card = requireTestValue(cardBox, 'Expected domain card box')
    const button = requireTestValue(buttonBox, 'Expected domain vote button box')
    expect(button.x).toBeLessThan(card.x + card.width / 2)
  })
})
