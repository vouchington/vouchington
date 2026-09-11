import { test, expect } from '../../helpers/test.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { AUTH_STATE } from '../../helpers/auth-state.mts'
import { loginAsUser } from '../../helpers/auth.mts'
import { randomSuffix as rand } from '../../helpers/random-id.mts'
import { createTestUser } from '../../../backend/test-helpers/index.mts'
import {
  insertTestReferralProgram,
  insertTestEmptyReferralProgram,
} from '../../helpers/insert-test-referral-program.mts'

test.describe('Referral Program Validations', () => {
  test.use({ storageState: AUTH_STATE })

  let referralProgram: Awaited<ReturnType<typeof insertTestReferralProgram>>
  let nonAdminUserId: string

  test.beforeAll(async () => {
    referralProgram = await insertTestReferralProgram(rand())
    const nonAdmin = await createTestUser({ username: `ref-non-admin-${rand()}` })
    if (!nonAdmin) throw new Error('Failed to create non-admin user')
    nonAdminUserId = nonAdmin.id
  })

  test('shows validations list with new button and table', async ({ page }) => {
    // Filter by the seeded validation's slug via ?search= so the assertion stays
    // deterministic as the shared validation pool grows (the list is not program-scoped).
    await navigateTo(
      page,
      `/referral-program/${referralProgram.referralProgramTopicSlug}/validations?search=${referralProgram.validationSlug}`,
    )

    await expect(page.getByTestId('referral-link-validations-new-button')).toBeVisible()
    await expect(page.getByTestId('referral-link-validations-table')).toBeVisible()
    await expect(page.getByTestId(`validation-link-${referralProgram.validationId}`)).toBeVisible()
  })

  test('redirects unauthenticated user to / for validations list', async ({ page }) => {
    await page.context().clearCookies()
    await navigateTo(
      page,
      `/referral-program/${referralProgram.referralProgramTopicSlug}/validations`,
    )
    await expect(page).toHaveURL('/')
  })

  test('redirects non-admin user away from validations list', async ({ page }) => {
    await page.context().clearCookies()
    await loginAsUser(page, nonAdminUserId)
    await navigateTo(
      page,
      `/referral-program/${referralProgram.referralProgramTopicSlug}/validations`,
    )
    // requireAdmin() redirects to `/`, which for a signed-in user resolves to the
    // logged-in home — assert the admin content never renders rather than a fixed URL.
    await expect(page.getByTestId('referral-link-validations-table')).not.toBeAttached()
    await expect(page.getByTestId('referral-link-validations-new-button')).not.toBeAttached()
  })

  test('shows validation detail page with edit heading and rules table', async ({ page }) => {
    await navigateTo(
      page,
      `/referral-program/${referralProgram.referralProgramTopicSlug}/validations/${referralProgram.validationId}`,
    )

    await expect(page.getByTestId('validation-edit-heading')).toBeVisible()
    await expect(page.getByTestId('validation-form-slug')).toBeVisible()
    await expect(page.getByTestId('validation-form-user-help-text')).toBeVisible()
    await expect(page.getByTestId('validation-form-submit')).toBeVisible()
    await expect(page.getByTestId('validation-rules-heading')).toBeVisible()
    await expect(page.getByTestId('validation-rules-table')).toBeVisible()
    await expect(page.getByTestId('validation-rules-add-button')).toBeVisible()
    await expect(page.getByTestId(`rule-edit-${referralProgram.ruleId}`)).toBeVisible()
    await expect(page.getByTestId(`rule-delete-${referralProgram.ruleId}`)).toBeVisible()
  })

  test('shows rule form when add rule button clicked', async ({ page }) => {
    await navigateTo(
      page,
      `/referral-program/${referralProgram.referralProgramTopicSlug}/validations/${referralProgram.validationId}`,
    )

    await page.getByTestId('validation-rules-add-button').click()

    await expect(page.getByTestId('rule-form-hostname')).toBeVisible()
    await expect(page.getByTestId('rule-form-pathname')).toBeVisible()
    await expect(page.getByTestId('rule-form-rule-type')).toBeVisible()
    await expect(page.getByTestId('rule-form-user-error-text')).toBeVisible()
    await expect(page.getByTestId('rule-form-example-urls')).toBeVisible()
    await expect(page.getByTestId('rule-form-submit')).toBeVisible()
    await expect(page.getByTestId('rule-form-cancel')).toBeVisible()
  })

  test('shows referral program validations page with link form and linked table', async ({
    page,
  }) => {
    await navigateTo(
      page,
      `/referral-program/${referralProgram.referralProgramTopicId}/settings/validations`,
    )

    await expect(page.getByTestId('referral-program-validations-manage-button')).toBeVisible()
    await expect(page.getByTestId('link-validation-heading')).toBeVisible()
    await expect(page.getByTestId('link-validation-slug-input')).toBeVisible()
    await expect(page.getByTestId('link-validation-submit')).toBeVisible()
    await expect(page.getByTestId('linked-validations-heading')).toBeVisible()
    await expect(page.getByTestId('linked-validations-table')).toBeVisible()
    await expect(
      page.getByTestId(`linked-validation-link-${referralProgram.validationId}`),
    ).toBeVisible()
    await expect(
      page.getByTestId(`unlink-validation-${referralProgram.validationId}`),
    ).toBeVisible()
  })

  test('navigates to validations settings via Settings dropdown', async ({ page }) => {
    await navigateTo(page, `/referral-program/${referralProgram.referralProgramTopicId}`)
    await page.getByTestId('topic-detail-tab-settings').click()
    await page.getByTestId('settings-tab-validations').click()
    await expect(page.getByTestId('topic-settings-validations')).toBeVisible()
  })

  test('admin can link and unlink a validation set via settings page', async ({ page }) => {
    await navigateTo(
      page,
      `/referral-program/${referralProgram.referralProgramTopicId}/settings/validations`,
    )
    await expect(page.getByTestId('topic-settings-validations')).toBeVisible()

    // Link the second (unlinked) validation set by slug
    await page
      .getByTestId('link-validation-slug-input')
      .pressSequentially(referralProgram.validationSlug2)
    await page.getByTestId('link-validation-submit').click()
    await expect(
      page.getByTestId(`linked-validation-link-${referralProgram.validationId2}`),
    ).toBeVisible()

    // Unlink it using the confirmation dialog
    await page.getByTestId(`unlink-validation-${referralProgram.validationId2}`).click()
    await page.getByTestId('unlink-validation-confirm').click()
    await expect(
      page.getByTestId(`linked-validation-link-${referralProgram.validationId2}`),
    ).toBeHidden()
  })

  test('redirects unauthenticated user to / for validations settings', async ({ page }) => {
    await page.context().clearCookies()
    await navigateTo(
      page,
      `/referral-program/${referralProgram.referralProgramTopicId}/settings/validations`,
    )
    await expect(page).toHaveURL('/')
  })
})

test.describe('Referral Program Validations — New Validation', () => {
  test.use({ storageState: AUTH_STATE })

  let referralProgram: Awaited<ReturnType<typeof insertTestReferralProgram>>

  test.beforeAll(async () => {
    referralProgram = await insertTestReferralProgram(rand())
  })

  test('new validation page shows form', async ({ page }) => {
    await navigateTo(
      page,
      `/referral-program/${referralProgram.referralProgramTopicSlug}/validations/new`,
    )

    await expect(page.getByTestId('validation-form-slug')).toBeVisible()
    await expect(page.getByTestId('validation-form-user-help-text')).toBeVisible()
    await expect(page.getByTestId('validation-form-submit')).toBeVisible()
  })
})

test.describe('Referral Program Validations — Empty Validations State', () => {
  test.use({ storageState: AUTH_STATE })

  let emptyProgramTopicId: string

  test.beforeAll(async () => {
    const result = await insertTestEmptyReferralProgram(rand())
    emptyProgramTopicId = result.topicId
  })

  test('shows empty validations state for program with no linked validations', async ({ page }) => {
    await navigateTo(page, `/referral-program/${emptyProgramTopicId}/settings/validations`)

    await expect(page.getByTestId('linked-validations-heading')).toBeVisible()
    await expect(page.getByTestId('linked-validations-empty')).toBeVisible()
  })
})
