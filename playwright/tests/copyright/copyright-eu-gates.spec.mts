import { expect, test, type Page } from '../../helpers/test.mts'
import { resetAnonymousBrowserStateBeforeNavigation } from '../../helpers/browser-state.mts'
import { navigateTo } from 'vouchington-tooling/playwright'
import { loginAsUser } from '../../helpers/auth.mts'
import { revealOwnedQueueItem } from '../../helpers/copyright-queue.mts'
import {
  approveJurisdictionPolicy,
  createTerritorialActors,
  seedDeterminedTerritorialNotice,
  seedPendingTerritorialNotice,
  type TerritorialActors,
} from '../../../backend/test-helpers/services/copyright-notices/territorial-routes.mts'
import { seedTerritorialRedress } from '../../../backend/test-helpers/copyright-territorial-redress-seed.mts'
import {
  recordEuDisputeSettlementOutcome,
  recordEuDisputeSettlementReferral,
} from '../../../backend/services/copyright-notices/eu-dispute-settlement.mts'
import { withdrawCopyrightJurisdictionPolicyApproval } from '../../../backend/services/copyright-notices/jurisdiction-policy.mts'

test.describe.configure({ mode: 'serial' })

test.describe('EU copyright navigation with unapproved intake', () => {
  test('blocked EU filing leaves browser history usable and keeps the US form available', async ({
    page,
  }) => {
    await resetAnonymousBrowserStateBeforeNavigation(page)
    await navigateTo(page, '/copyright')
    await expect(
      page.getByRole('link', { name: 'Submit an EU copyright notice', exact: true }),
    ).toHaveCount(0)
    await navigateTo(page, '/copyright/eu-notices/new')
    await expect(page).toHaveURL(/\/copyright\/eu-notices\/new$/)
    await expect(page.getByTestId('copyright-eu-notice-form')).toHaveCount(0)
    await expect(page.getByTestId('copyright-eu-guest-receipt')).toHaveCount(0)
    await page.goBack()
    await expect(page).toHaveURL(/\/copyright$/)
    await page.getByRole('link', { name: 'Submit a copyright notice', exact: true }).click()
    await expect(page).toHaveURL(/\/copyright\/notices\/new$/)
    await expect(page.getByTestId('copyright-notice-form')).toBeVisible()
  })

  test('a complaint navigation cannot expose case controls before sign-in and the login input hydrates', async ({
    page,
  }) => {
    await resetAnonymousBrowserStateBeforeNavigation(page)
    const noticeId = crypto.randomUUID()
    await navigateTo(page, `/copyright/notices/${noticeId}/complaint`)
    await expect(page).toHaveURL(/\/login(?:\?|$)/)
    await expect(page.getByTestId('copyright-eu-complaint-form')).toHaveCount(0)
    await expect(page.getByTestId('copyright-eu-notice-detail')).toHaveCount(0)
    await expect(page.getByTestId('copyright-eu-dispute-settlements')).toHaveCount(0)
    const email = page.getByTestId('login-email-input')
    await expect(email).toBeEditable()
    await email.pressSequentially('copyright-navigation@example.test')
    await expect(email).toHaveValue('copyright-navigation@example.test')
  })
})

// Approval is global, so these run after the unapproved checks above (one worker runs a file in
// order) and withdraw it again before any other file observes it.
test.describe('EU copyright controls with an approved policy', () => {
  let actors: TerritorialActors
  let approvalId: string

  test.beforeAll(async () => {
    actors = await createTerritorialActors()
    approvalId = (await approveJurisdictionPolicy(actors.administrator, 'eu_dsa')).id
  })

  test.afterAll(async () => {
    await withdrawCopyrightJurisdictionPolicyApproval(actors.administrator, approvalId)
  })

  async function openStaffCase(page: Page, noticeId: string) {
    await loginAsUser(page, actors.staff.id)
    await navigateTo(page, '/copyright/review-queue')
    const item = page
      .getByRole('article')
      .filter({ has: page.getByRole('heading', { name: `Case ${noticeId}`, exact: true }) })
    await revealOwnedQueueItem(page, item, '/api/v1/copyright-notices/review-queue')
    return item
  }

  test('the EU notice form is offered', async ({ page }) => {
    await resetAnonymousBrowserStateBeforeNavigation(page)
    await navigateTo(page, '/copyright/eu-notices/new')
    await expect(page.getByTestId('copyright-eu-notice-form-submit')).toBeAttached()
  })

  test('the notifier can complain about a decision', async ({ page }) => {
    const noticeId = await seedDeterminedTerritorialNotice('eu_dsa', actors)
    await loginAsUser(page, actors.claimant.id)
    await navigateTo(page, `/copyright/notices/${noticeId}/complaint`)
    await expect(page.getByTestId('copyright-eu-complaint-form-submit')).toBeAttached()
  })

  test('staff can record a failed acknowledgment or a first decision', async ({ page }) => {
    const noticeId = await seedPendingTerritorialNotice('eu_dsa', actors.claimant)
    const item = await openStaffCase(page, noticeId)
    await expect(item.getByTestId('copyright-staff-territorial-record-failure')).toBeAttached()
    await expect(item.getByTestId('copyright-staff-territorial-decision-submit')).toBeAttached()
  })

  test('staff can review a complaint and refer a dispute', async ({ page }) => {
    const { noticeId } = await seedTerritorialRedress('eu_dsa', actors)
    const item = await openStaffCase(page, noticeId)
    await expect(
      item.getByTestId('copyright-staff-territorial-complaint-review-submit'),
    ).toBeAttached()
    await expect(
      item.getByTestId('copyright-staff-territorial-dispute-referral-submit'),
    ).toBeAttached()
  })

  test('staff can record a dispute outcome', async ({ page }) => {
    const { noticeId } = await seedTerritorialRedress('eu_dsa', actors)
    await recordEuDisputeSettlementReferral(actors.staff, noticeId, {
      bodyName: 'Dispute body',
      referredAt: new Date(),
      referredByParty: 'notifier',
      referredByUserId: actors.claimant.id,
    })
    const item = await openStaffCase(page, noticeId)
    await expect(
      item.getByTestId('copyright-staff-territorial-dispute-record-submit'),
    ).toBeAttached()
  })

  test('staff can record that a favorable dispute outcome was implemented', async ({ page }) => {
    const { noticeId } = await seedTerritorialRedress('eu_dsa', actors)
    const referredAt = new Date()
    const referral = await recordEuDisputeSettlementReferral(actors.staff, noticeId, {
      bodyName: 'Dispute body',
      referredAt,
      referredByParty: 'notifier',
      referredByUserId: actors.claimant.id,
    })
    await recordEuDisputeSettlementOutcome(actors.staff, noticeId, referral.id, {
      result: 'decided_for_recipient',
      decidedAt: referredAt,
    })
    const item = await openStaffCase(page, noticeId)
    await expect(
      item.getByTestId('copyright-staff-territorial-dispute-implementation-submit'),
    ).toBeAttached()
  })
})
