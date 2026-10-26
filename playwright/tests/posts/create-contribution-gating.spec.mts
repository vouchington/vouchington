import { test, expect, protectPlaywrightHookTimeouts } from '../../helpers/test.mts'
import { loginAsTestUser as loginAsAdmin, loginAsUser } from '../../helpers/auth.mts'
import { navigateTo, randomSuffix } from 'vouchington-tooling/playwright'
import {
  createTestUserWithAge,
  insertTestCommunity,
  insertTestCommunityMember,
  CONTRIBUTING_USER_AGE_MS,
} from '../../../backend/test-helpers/index.mts'

let tooNewUserId: string
let unverifiedUserId: string
let eligibleUserId: string
let communitySlug: string

test.beforeAll(async () => {
  protectPlaywrightHookTimeouts(test.info())
  const tooNew = await createTestUserWithAge(0)
  if (!tooNew) throw new Error('Failed to create too-new test user')
  tooNewUserId = tooNew.id

  const unverified = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS, { noEmail: true })
  if (!unverified) throw new Error('Failed to create unverified test user')
  unverifiedUserId = unverified.id

  const eligible = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
  if (!eligible) throw new Error('Failed to create eligible test user')
  eligibleUserId = eligible.id

  const suffix = randomSuffix()
  communitySlug = `pw-gating-${suffix}`

  const community = await insertTestCommunity({
    name: `PW Gating ${suffix}`,
    slug: communitySlug,
    createdById: eligibleUserId,
  })
  await insertTestCommunityMember({ communityId: community.id, userId: tooNewUserId })
  await insertTestCommunityMember({ communityId: community.id, userId: unverifiedUserId })
})

test.describe('contribution gating — account_too_new', () => {
  test('discussions/create shows CTA, hides form', async ({ page }) => {
    await loginAsUser(page, tooNewUserId)
    await navigateTo(page, '/discussions/create')

    await expect(page.getByTestId('contribution-gated-cta')).toBeVisible()
    await expect(page.getByTestId('contribution-gated-cta-primary')).toHaveAttribute(
      'href',
      '/plans',
    )
    await expect(page.getByTestId('post-form')).not.toBeAttached()
  })

  test('reviews/create shows CTA, hides form', async ({ page }) => {
    await loginAsUser(page, tooNewUserId)
    await navigateTo(page, '/reviews/create')

    await expect(page.getByTestId('contribution-gated-cta')).toBeVisible()
    await expect(page.getByTestId('post-form')).not.toBeAttached()
  })

  test('data-points/create shows CTA, hides form', async ({ page }) => {
    await loginAsUser(page, tooNewUserId)
    await navigateTo(page, '/data-points/create')

    await expect(page.getByTestId('contribution-gated-cta')).toBeVisible()
    await expect(page.getByTestId('post-form')).not.toBeAttached()
  })

  test('community posts/create shows CTA, hides form', async ({ page }) => {
    await loginAsUser(page, tooNewUserId)
    await navigateTo(page, `/communities/${communitySlug}/posts/create`)

    await expect(page.getByTestId('contribution-gated-cta')).toBeVisible()
    await expect(page.getByTestId('post-form')).not.toBeAttached()
  })
})

test.describe('contribution gating — email_verification_required', () => {
  test('discussions/create shows CTA with secondary link, hides form', async ({ page }) => {
    await loginAsUser(page, unverifiedUserId)
    await navigateTo(page, '/discussions/create')

    await expect(page.getByTestId('contribution-gated-cta')).toBeVisible()
    await expect(page.getByTestId('contribution-gated-cta-secondary')).toBeVisible()
    await expect(page.getByTestId('contribution-gated-cta-email-recovery')).toBeVisible()
    await expect(page.getByTestId('post-form')).not.toBeAttached()
  })

  test('reviews/create shows CTA with secondary link, hides form', async ({ page }) => {
    await loginAsUser(page, unverifiedUserId)
    await navigateTo(page, '/reviews/create')

    await expect(page.getByTestId('contribution-gated-cta')).toBeVisible()
    await expect(page.getByTestId('contribution-gated-cta-secondary')).toBeVisible()
    await expect(page.getByTestId('post-form')).not.toBeAttached()
  })

  test('data-points/create shows CTA with secondary link, hides form', async ({ page }) => {
    await loginAsUser(page, unverifiedUserId)
    await navigateTo(page, '/data-points/create')

    await expect(page.getByTestId('contribution-gated-cta')).toBeVisible()
    await expect(page.getByTestId('contribution-gated-cta-secondary')).toBeVisible()
    await expect(page.getByTestId('post-form')).not.toBeAttached()
  })

  test('community posts/create shows CTA with secondary link, hides form', async ({ page }) => {
    await loginAsUser(page, unverifiedUserId)
    await navigateTo(page, `/communities/${communitySlug}/posts/create`)

    await expect(page.getByTestId('contribution-gated-cta')).toBeVisible()
    await expect(page.getByTestId('contribution-gated-cta-secondary')).toBeVisible()
    await expect(page.getByTestId('post-form')).not.toBeAttached()
  })
})

test.describe('contribution gating — eligible user sees form', () => {
  test('discussions/create shows form for eligible user', async ({ page }) => {
    await loginAsUser(page, eligibleUserId)
    await navigateTo(page, '/discussions/create')

    await expect(page.getByTestId('post-form')).toBeVisible()
    await expect(page.getByTestId('form-actions-cancel')).toBeVisible()
    await expect(page.getByTestId('contribution-gated-cta')).not.toBeAttached()
    await page.getByTestId('discussion-fields-add-category').click()
    await expect(page.getByTestId('discussion-hashtag-category').first()).toBeVisible()
    await expect(page.getByTestId('discussion-fields-add-category')).toBeVisible()
    await expect(page.getByTestId('discussion-fields-move-category-up').first()).toBeVisible()
    await expect(page.getByTestId('discussion-fields-move-category-down').first()).toBeVisible()
    await expect(page.getByTestId('discussion-fields-remove-category').first()).toBeVisible()
  })
})

test.describe('contribution gating — official accounts', () => {
  test('reviews/create shows official account gate and hides form', async ({ page }) => {
    await loginAsAdmin(page)
    await navigateTo(page, '/reviews/create')

    await expect(page.getByTestId('official-account-review-gate')).toBeVisible()
    await expect(page.getByTestId('post-form')).not.toBeAttached()
  })

  test('data-points/create shows official account gate and hides form', async ({ page }) => {
    await loginAsAdmin(page)
    await navigateTo(page, '/data-points/create')

    await expect(page.getByTestId('official-account-data-point-gate')).toBeVisible()
    await expect(page.getByTestId('post-form')).not.toBeAttached()
  })
})
