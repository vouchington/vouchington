import { test, expect } from '../../helpers/test.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { AUTH_STATE } from '../../helpers/auth-state.mts'
import { waitForBelowFoldHydration } from '../../helpers/wait-for-hydration.mts'

const JANE_ID = '019d0000-0000-7000-a000-000000000001'
const ALEX_ID = '019d0000-0000-7000-a000-000000000002'
const SEEDED_CRM_QUERY = '-pw@voucha.ai'
const SEEDED_CRM_URL = `/crm?q=${encodeURIComponent(SEEDED_CRM_QUERY)}`

test.describe('Admin CRM', () => {
  test.use({ storageState: AUTH_STATE })

  test('should redirect unauthenticated users to home', async ({ page }) => {
    await page.context().clearCookies()
    await navigateTo(page, '/crm')
    await expect(page).toHaveURL('/')
  })

  test('should display CRM contacts list', async ({ page }) => {
    await navigateTo(page, SEEDED_CRM_URL)

    await expect(
      page.getByTestId('admin-page-header-title').filter({ hasText: 'CRM Contacts' }),
    ).toBeVisible()

    // Seeded contacts
    await expect(page.getByTestId(`crm-contact-link-${JANE_ID}`)).toBeVisible()
    await expect(page.getByTestId(`crm-contact-link-${ALEX_ID}`)).toBeVisible()
  })

  test('should filter contacts by search query', async ({ page }) => {
    await navigateTo(page, SEEDED_CRM_URL)

    await page.getByTestId('crm-search-input').fill('jane-travel')
    await page.getByTestId('crm-search-submit').click()

    await expect(page.getByTestId(`crm-contact-link-${JANE_ID}`)).toBeVisible()
    await expect(page.getByTestId(`crm-contact-link-${ALEX_ID}`)).toBeHidden()
  })

  test('should navigate to contact detail', async ({ page }) => {
    await navigateTo(page, SEEDED_CRM_URL)

    await page.getByTestId(`crm-contact-link-${JANE_ID}`).click()
    await page.waitForLoadState('load')

    await expect(page).toHaveURL(new RegExp(`/crm/${JANE_ID}`))
    await expect(page.getByTestId('crm-contact-page-heading')).toContainText('Jane Travel Creator')
    await expect(page.getByTestId('crm-contact-info-email')).toHaveText(
      'tests+jane-travel-pw@voucha.ai',
    )
  })

  test('should show social accounts on contact detail', async ({ page }) => {
    await navigateTo(page, `/crm/${JANE_ID}`)

    await expect(page.getByTestId('crm-social-account-@janetravelcreator')).toBeVisible()
    await expect(page.getByTestId('crm-social-account-@JaneTravels')).toBeVisible()
  })

  test('should show compose email dialog', async ({ page }) => {
    await navigateTo(page, `/crm/${JANE_ID}`)

    const composeButton = page.getByTestId('crm-compose-email-trigger')
    await expect(composeButton).toBeVisible()
    await composeButton.scrollIntoViewIfNeeded()
    await waitForBelowFoldHydration(page)
    await composeButton.click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await expect(page.getByTestId('crm-compose-email-subject')).toBeVisible()
  })

  test('should show CSV import dialog', async ({ page }) => {
    await navigateTo(page, '/crm')

    const importButton = page.getByTestId('crm-import-csv-trigger')
    await expect(importButton).toBeVisible()
    await importButton.scrollIntoViewIfNeeded()
    await waitForBelowFoldHydration(page)
    await importButton.click()
    await expect(page.getByRole('dialog')).toBeVisible()
  })

  test('should navigate between list and detail', async ({ page }) => {
    await navigateTo(page, SEEDED_CRM_URL)

    await page.getByTestId(`crm-contact-link-${JANE_ID}`).click()
    await expect(page).toHaveURL(/\/crm\/019d0000/)

    await page.goBack()
    await expect(page).toHaveURL(SEEDED_CRM_URL)
  })
})
