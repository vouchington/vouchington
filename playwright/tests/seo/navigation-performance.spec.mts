import { navigateTo } from '../../helpers/navigate-to.mts'
import { expect, test } from '../../helpers/test.mts'

test.describe('Navigation performance hints', () => {
  test('renders anonymous speculation rules for public navigation', async ({ page }) => {
    await navigateTo(page, '/')

    const script = page.getByTestId('navigation-speculation-rules-script')
    await expect(script).toHaveCount(1)
    await expect(script).toHaveAttribute('type', 'speculationrules')
  })
})
