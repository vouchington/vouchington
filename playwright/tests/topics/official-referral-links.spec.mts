import { test, expect } from '../../helpers/test.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { AUTH_STATE } from '../../helpers/auth-state.mts'
import { loginAsUser } from '../../helpers/auth.mts'
import { randomSuffix as rand } from '../../helpers/random-id.mts'
import { createTestUser } from '../../../backend/test-helpers/index.mts'
import { insertTestReferralProgram } from '../../helpers/insert-test-referral-program.mts'

test.describe('Official Referral Links — admin management', () => {
  test.use({ storageState: AUTH_STATE })

  let program: Awaited<ReturnType<typeof insertTestReferralProgram>>
  let nonAdminId: string

  test.beforeAll(async () => {
    program = await insertTestReferralProgram(`off-${rand()}`)
    const nonAdmin = await createTestUser({ username: `off-nonadmin-${rand()}` })
    if (!nonAdmin) throw new Error('Failed to create non-admin user')
    nonAdminId = nonAdmin.id
  })

  test('admin sees official-referral-link-form with inputs and empty table on referral-links tab', async ({
    page,
  }) => {
    await navigateTo(page, `/referral-program/${program.referralProgramTopicSlug}/referral-links`)
    await expect(page.getByTestId('official-referral-link-form')).toBeVisible()
    await expect(page.getByTestId('official-referral-link-url-input')).toBeVisible()
    await expect(page.getByTestId('official-referral-link-label-input')).toBeVisible()
    await expect(page.getByTestId('official-referral-link-submit')).toBeVisible()
    await expect(page.getByTestId('official-referral-links-table')).toBeVisible()
  })

  test('admin can create an official link and it shows official-voucha-badge on public page', async ({
    page,
  }) => {
    await navigateTo(page, `/referral-program/${program.referralProgramTopicSlug}/referral-links`)
    await page.getByTestId('official-referral-link-url-input').pressSequentially(program.url)
    await page
      .getByTestId('official-referral-link-label-input')
      .pressSequentially('Our official link')
    await page.getByTestId('official-referral-link-submit').click()
    // After create + router.refresh(), the delete button appears for the new row
    await expect(page.getByTestId('official-referral-link-delete').first()).toBeVisible()

    // Navigate to the public referral-links tab to verify the badge
    await navigateTo(page, `/referral-program/${program.referralProgramTopicSlug}/referral-links`)
    // The card root, official badge, and clickable ExternalLink anchor should all be present
    await expect(page.getByTestId('referral-link-card').first()).toBeVisible()
    await expect(page.getByTestId('official-voucha-badge').first()).toBeVisible()
    await expect(page.getByTestId('external-link').first()).toBeVisible()
  })

  test('non-admin does not see official-referral-link-form on referral-links tab', async ({
    page,
  }) => {
    await page.context().clearCookies()
    await loginAsUser(page, nonAdminId)
    await navigateTo(page, `/referral-program/${program.referralProgramTopicSlug}/referral-links`)
    await expect(page.getByTestId('official-referral-link-form')).not.toBeAttached()
  })
})

test.describe('Official Referral Links — personal gate for official accounts', () => {
  let program: Awaited<ReturnType<typeof insertTestReferralProgram>>
  let investorUserId: string

  test.beforeAll(async () => {
    program = await insertTestReferralProgram(`off-gate-${rand()}`)
    const investorUser = await createTestUser({
      username: `off-investor-${rand()}`,
      extraRoles: ['investor'],
    })
    if (!investorUser) throw new Error('Failed to create investor user')
    investorUserId = investorUser.id
  })

  test('non-admin official account sees referral-link gate instead of personal form', async ({
    page,
  }) => {
    await loginAsUser(page, investorUserId)
    await navigateTo(page, `/referral-program/${program.referralProgramTopicSlug}/referral-links`)
    await expect(page.getByTestId('official-account-referral-link-gate')).toBeVisible()
    await expect(page.getByTestId('referral-link-form-heading')).not.toBeAttached()
  })
})
