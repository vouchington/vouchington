import { expect, test } from '../../helpers/test.mts'
import { loginAsUser } from '../../helpers/auth.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { randomSuffix } from '../../helpers/random-id.mts'
import {
  createTestUser,
  insertTestTopic,
  insertTestReview,
} from '../../../backend/test-helpers/index.mts'
import { createTopicClaim } from '../../../backend/services/topic-claims/create.mts'
import { adminVerifyTopicClaim } from '../../../backend/services/topic-claims/admin-verify.mts'

let claimantUserId = ''
let nonClaimantUserId = ''
let staffUserId = ''
let reviewPostId = ''

test.beforeAll(async () => {
  const suffix = randomSuffix()

  const staff = await createTestUser({
    username: `dispute-staff-${suffix}`,
    administrator: true,
  })
  if (!staff) throw new Error('Failed to create staff user')
  staffUserId = staff.id

  const claimant = await createTestUser({ username: `dispute-claimant-${suffix}` })
  if (!claimant) throw new Error('Failed to create claimant user')
  claimantUserId = claimant.id

  const nonClaimant = await createTestUser({ username: `dispute-nonclaim-${suffix}` })
  if (!nonClaimant) throw new Error('Failed to create non-claimant user')
  nonClaimantUserId = nonClaimant.id

  // Create a topic and a review post rating that topic
  const topicId = await insertTestTopic({
    name: `Dispute Test Topic ${suffix}`,
    slug: `dispute-test-topic-${suffix}`,
    createdById: staffUserId,
  })

  const reviewAuthor = await createTestUser({ username: `dispute-reviewer-${suffix}` })
  if (!reviewAuthor) throw new Error('Failed to create review author')

  reviewPostId = await insertTestReview({
    userId: reviewAuthor.id,
    topicRatings: [{ topicId, rating: 3 }],
    title: `Dispute Filing Test Review ${suffix}`,
    markdown: 'A review for testing dispute filing.',
  })

  // Create and verify a topic claim for the claimant user
  const { claim } = await createTopicClaim(claimantUserId, {
    topicId,
    claimedRole: 'Owner',
    evidence: '',
  })
  await adminVerifyTopicClaim(staffUserId, claim.id)
})

test.describe('/review/[id] — dispute filing for verified topic claimant', () => {
  test('verified claimant sees "Dispute this review" button', async ({ page }) => {
    await loginAsUser(page, claimantUserId)
    await navigateTo(page, `/review/${reviewPostId}`)

    await expect(page.locator('main')).toBeVisible()
    await expect(page.getByTestId('dispute-review-button')).toBeVisible()
  })

  test('non-claimant user does not see "Dispute this review" button', async ({ page }) => {
    await loginAsUser(page, nonClaimantUserId)
    await navigateTo(page, `/review/${reviewPostId}`)

    await expect(page.locator('main')).toBeVisible()
    // Wait for the review body to confirm the Suspense boundary has resolved before
    // asserting the absence of the dispute button (non-claimant should not see it).
    await expect(page.getByTestId('post-detail-content')).toBeVisible()
    await expect(page.getByTestId('dispute-review-button')).toHaveCount(0)
  })

  test('clicking "Dispute this review" opens dialog with form fields', async ({ page }) => {
    await loginAsUser(page, claimantUserId)
    await navigateTo(page, `/review/${reviewPostId}`)

    await page.getByTestId('dispute-review-button').click()
    await expect(page.getByTestId('dispute-review-dialog')).toBeVisible()
    await expect(page.getByTestId('dispute-form')).toBeVisible()
    await expect(page.getByTestId('dispute-reason-select')).toBeVisible()
    await expect(page.getByTestId('claim-text')).toBeVisible()
    await expect(page.getByTestId('dispute-submit')).toBeVisible()
    await expect(page.getByTestId('turnstile-container')).toBeVisible()
  })

  test('submit button is disabled until reason + claim text + Turnstile token are present', async ({
    page,
  }) => {
    await loginAsUser(page, claimantUserId)
    await navigateTo(page, `/review/${reviewPostId}`)

    await page.getByTestId('dispute-review-button').click()
    await expect(page.getByTestId('dispute-form')).toBeVisible()

    // Initially disabled — no reason, no text, no token
    await expect(page.getByTestId('dispute-submit')).toBeDisabled()

    // Select a reason
    await page.getByTestId('dispute-reason-select').click()
    await page.getByRole('listbox').getByRole('option', { name: 'Factually inaccurate' }).click()
    // Wait for listbox to close
    await expect(page.getByRole('listbox')).toBeHidden()

    // Still disabled — no claim text yet
    await expect(page.getByTestId('dispute-submit')).toBeDisabled()

    // Type claim text — click first to ensure focus is on the textarea.
    await page.getByTestId('claim-text').click()
    await page
      .getByTestId('claim-text')
      .pressSequentially('This review contains factual errors about our product.')

    // Should become enabled once Turnstile stub token is injected
    await expect(page.getByTestId('dispute-submit')).toBeEnabled()
  })

  test('can file a dispute and see submitted confirmation', async ({ page }) => {
    await loginAsUser(page, claimantUserId)
    await navigateTo(page, `/review/${reviewPostId}`)

    await page.getByTestId('dispute-review-button').click()
    await expect(page.getByTestId('dispute-form')).toBeVisible()

    // Select a reason via Radix Select
    await page.getByTestId('dispute-reason-select').click()
    await page.getByRole('listbox').getByRole('option', { name: 'Factually inaccurate' }).click()
    // Wait for listbox to close before continuing
    await expect(page.getByRole('listbox')).toBeHidden()

    // Fill in the claim text; Cmd/Ctrl+Enter submits via submitOnCmdEnter in <Textarea>.
    // Click explicitly to ensure focus is on the textarea (Radix Select returns focus
    // to the trigger on close; without this click, pressSequentially may dispatch to
    // the wrong element if the trigger has focus).
    const claimText = page.getByTestId('claim-text')
    await claimText.click()
    await claimText.pressSequentially(
      'The review contains multiple factual inaccuracies about our service.',
    )

    // Wait for Turnstile stub token to enable submit, then submit via keyboard
    // (avoids dialog-overlay z-index hit-test issues).
    await expect(page.getByTestId('dispute-submit')).toBeEnabled()
    await claimText.press('ControlOrMeta+Enter')

    // Confirm submitted state is shown
    await expect(page.getByTestId('dispute-submitted')).toBeVisible()
  })
})
