import { test, expect } from '../../../helpers/test.mts'
import { navigateTo } from '../../../helpers/navigate-to.mts'
import { AUTH_STATE } from '../../../helpers/auth-state.mts'

const SEEDED_CONTACT_EMAIL = 'agent-test@playwright.seed'
const SEEDED_CONTACT_ID = '019d0000-0000-7000-8000-000000000006'

test.describe('Admin Support — contacts', () => {
  test.use({ storageState: AUTH_STATE })

  test('searches contacts and opens read-only contact detail', async ({ page }) => {
    await navigateTo(page, '/support/contacts')
    const search = page.getByLabel('Search support contacts')
    await search.pressSequentially(SEEDED_CONTACT_EMAIL)
    await search.press('Enter')
    await expect(page).toHaveURL(/\/support\/contacts\?q=agent-test%40playwright\.seed/)

    const contactLink = page.getByTestId(`support-contact-link-${SEEDED_CONTACT_ID}`)
    await expect(contactLink).toBeVisible()
    await contactLink.click()
    await expect(page.getByTestId('support-contact-page-heading')).toBeVisible()
    await expect(page.getByRole('textbox')).toHaveCount(0)
  })
})
