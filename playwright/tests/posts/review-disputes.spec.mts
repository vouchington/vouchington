import { test, expect } from '../../helpers/test.mts'
import { AUTH_STATE } from '../../helpers/auth-state.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { createSiteModeratorUser, loginAsUser } from '../../helpers/auth.mts'
import {
  createTestUser,
  createTestTopic,
  insertTestTopic,
  insertTestReview,
  insertTestReviewDispute,
  insertTestTopicClaim,
} from '../../../backend/test-helpers/index.mts'
import { SEEDED_IDS } from '../../../integration-tests/web/helpers/constants.mts'
import { requireTestValue } from '../../helpers/assertions.mts'
import { randomSuffix } from '../../helpers/random-id.mts'

// Seeded multi-topic review for dispute testing
let smModeratorId = ''
let reviewerId = ''
let disputedReviewId = ''
let claimFormTopicId = ''
let manualClaimTopicId = ''
let verificationTopicId = ''
let verificationClaimId = ''
const verificationClaimEvidence = `Deterministic Playwright topic claim ${randomSuffix()}`

test.beforeAll(async () => {
  // Seed a deterministic pending dispute for the staff-queue tests
  const reviewer = requireTestValue(await createTestUser(), 'Failed to create reviewer')
  reviewerId = reviewer.id
  const topicId = SEEDED_IDS.topic
  disputedReviewId = await insertTestReview({
    userId: reviewer.id,
    topicRatings: [{ topicId, rating: 4 }],
    title: `Disputed Playwright review ${randomSuffix()}`,
    markdown: 'Deterministic review content for the dispute detail assertion.',
  })
  await insertTestReviewDispute({ postId: disputedReviewId, topicId, disputantUserId: reviewer.id })

  const suffix = randomSuffix()
  claimFormTopicId = await insertTestTopic({
    name: `Claim form test topic ${suffix}`,
    slug: `claim-form-test-${suffix}`,
    createdById: reviewer.id,
  })
  manualClaimTopicId = await insertTestTopic({
    name: `Manual claim test topic ${suffix}`,
    slug: `manual-claim-test-${suffix}`,
    createdById: reviewer.id,
  })
  await insertTestTopicClaim({
    topicId: manualClaimTopicId,
    claimantUserId: reviewer.id,
    submittedAt: null,
  })
  verificationTopicId = (
    await createTestTopic({
      user: reviewer,
      name: `Claim verification test topic ${suffix}`,
      slug: `claim-verification-test-${suffix}`,
      hostname: `claim-verification-${suffix}.example.com`,
    })
  ).id
  verificationClaimId = await insertTestTopicClaim({
    topicId: verificationTopicId,
    claimantUserId: reviewer.id,
    claimedRole: 'Owner',
    evidence: verificationClaimEvidence,
  })
})

test.describe('Review Disputes - public queue', () => {
  test('disputes list page renders with member tier', async ({ page }) => {
    await loginAsUser(page, reviewerId)
    await navigateTo(page, '/disputes')
    await expect(page.getByTestId('disputes-heading')).toBeVisible()
    await expect(page.getByTestId('disputes-list')).toBeVisible()
    await expect(page.getByTestId('member-dispute-row').first()).toBeVisible()
  })

  test("my disputes page shows the reviewer's seeded dispute", async ({ page }) => {
    await loginAsUser(page, reviewerId)
    await navigateTo(page, '/my/disputes')
    await expect(page.getByTestId('disputes-list')).toBeVisible()
    await expect(page.getByTestId('member-dispute-row').first()).toBeVisible()
  })
})

test.describe('Admin - topic claims and dispute queue', () => {
  test.use({ storageState: AUTH_STATE })

  test('admin topic claims page renders', async ({ page }) => {
    await navigateTo(page, '/admin/topic-claims')
    const review = page
      .getByTestId('topic-claim-review')
      .filter({ hasText: verificationClaimEvidence })
    await expect(page.getByTestId('admin-topic-claims')).toBeVisible()
    await expect(review).toBeVisible()
    await expect(review.getByTestId('claim-approve')).toBeVisible()
    await expect(review.getByTestId('claim-reject')).toBeVisible()
  })

  test('admin disputes queue shows staff row when disputes exist', async ({ page }) => {
    await navigateTo(page, '/disputes')
    await expect(page.getByTestId('disputes-list')).toBeVisible()
    // A dispute was seeded in the module-level beforeAll — this assertion is now deterministic
    const disputeRows = page.getByTestId('dispute-row')
    await expect(disputeRows.first()).toBeVisible()
    await expect(disputeRows.first().getByTestId('dispute-context')).toBeVisible()
    // Staff controls should be present
    await expect(page.getByTestId('dispute-public-response').first()).toBeVisible()
    await expect(page.getByTestId('dispute-approve').first()).toBeVisible()
    await expect(page.getByTestId('dispute-send').first()).toBeVisible()
    await expect(page.getByTestId('dispute-annotate').first()).toBeVisible()
    await expect(page.getByTestId('dispute-remove').first()).toBeVisible()
    await expect(page.getByTestId('dispute-dismiss').first()).toBeVisible()
  })
})

test.describe('Disputes — Site Moderator staff queue', () => {
  test.beforeAll(async () => {
    const moderator = await createSiteModeratorUser()
    smModeratorId = moderator.id
  })

  test('site moderator sees staff dispute-row on /disputes', async ({ page }) => {
    await loginAsUser(page, smModeratorId)
    await navigateTo(page, '/disputes')
    await expect(page.getByTestId('disputes-list')).toBeVisible()
    // A dispute was seeded in the module-level beforeAll
    const disputeRows = page.getByTestId('dispute-row')
    await expect(disputeRows.first()).toBeVisible()
    await expect(page.getByTestId('dispute-approve').first()).toBeVisible()
    await expect(page.getByTestId('dispute-dismiss').first()).toBeVisible()
  })
})

test.describe('Review page - pending dispute', () => {
  test('review detail page renders the deterministic disputed review', async ({ page }) => {
    await loginAsUser(page, reviewerId)
    await navigateTo(page, `/review/${disputedReviewId}`)
    await expect(page.locator('main')).toBeVisible()
    await expect(page.getByTestId('post-detail-content')).toBeVisible()
  })
})

test.describe('Topic claim form states', () => {
  test('unclaimed topic renders a claim form', async ({ page }) => {
    await loginAsUser(page, reviewerId)
    await navigateTo(page, `/topic-claims/${claimFormTopicId}`)

    await expect(page.getByTestId('claim-topic-form')).toBeVisible()
    await expect(page.getByTestId('claim-submit')).toBeVisible()
  })

  test('claimed topic renders its domain verification panel', async ({ page }) => {
    await loginAsUser(page, reviewerId)
    await navigateTo(page, `/topic-claims/${verificationTopicId}`)

    await expect(page.getByTestId('domain-verification-panel')).toBeVisible()
    await expect(page.getByRole('tab', { name: 'DNS TXT Record' })).toBeVisible()
  })

  test('claimed topic without a hostname renders manual evidence', async ({ page }) => {
    await loginAsUser(page, reviewerId)
    await navigateTo(page, `/topic-claims/${manualClaimTopicId}`)

    await expect(page.getByTestId('domain-verification-panel')).toBeVisible()
    await expect(page.getByTestId('evidence-textarea')).toBeVisible()
  })

  test('domain verification exposes its backend failure', async ({ page }) => {
    await loginAsUser(page, reviewerId)
    await page.route(
      `**/api/v1/topics/${verificationTopicId}/claims/${verificationClaimId}/domain-verification`,
      route =>
        route.fulfill({
          status: 422,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'Verification record was not found.' }),
        }),
    )
    await navigateTo(page, `/topic-claims/${verificationTopicId}`)
    await page.getByRole('button', { name: 'Generate verification token' }).click()
    await expect(page.getByTestId('verify-domain')).toBeVisible()
    await page.getByTestId('verify-domain').click()
    await expect(page.getByTestId('verification-error')).toContainText(
      'Verification record was not found.',
    )
  })
})
