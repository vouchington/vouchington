import { test, expect } from '../../helpers/test.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { loginAsUser } from '../../helpers/auth.mts'
import { waitForBelowFoldHydration } from '../../helpers/wait-for-hydration.mts'
import { randomSuffix } from '../../helpers/random-id.mts'
import { insertTestReferralProgram } from '../../helpers/insert-test-referral-program.mts'
import {
  CONTRIBUTING_USER_AGE_MS,
  createTestUserWithAge,
} from '../../../backend/test-helpers/index.mts'

const REFERRAL_PROGRAM = {
  id: '019c64e6-b400-7000-b000-000000000001',
  name: 'Chase Sapphire Referral',
  slug: 'referral-program',
}

const CARD_TOPIC = {
  id: '019c64e6-f710-74cb-b36d-130af8ff1067',
  slug: 'card',
}

const UNLINKED_TOPIC = {
  id: '019c64e6-f713-7bf3-8b1e-a869aa7c9cf1',
  slug: 'card',
}

test.describe('Referral Links Tab', () => {
  let contributorId: string

  test.beforeAll(async () => {
    const contributor = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    if (!contributor) throw new Error('Failed to create referral links contributor')
    contributorId = contributor.id
  })

  test.beforeEach(async ({ page }) => {
    await loginAsUser(page, contributorId)
  })

  test('referral links tab loads for referral program topic', async ({ page }) => {
    await navigateTo(page, `/${REFERRAL_PROGRAM.slug}/${REFERRAL_PROGRAM.id}/referral-links`)

    await expect(page.getByTestId('referral-links-page-heading')).toBeVisible()
    await expect(page).toHaveURL(new RegExp(`/${REFERRAL_PROGRAM.slug}/.+/referral-links`))
  })

  test('referral links tab loads for card topic linked to referral program', async ({ page }) => {
    await navigateTo(page, `/${CARD_TOPIC.slug}/${CARD_TOPIC.id}/referral-links`)
    await expect(page.getByTestId('referral-links-page-heading')).toBeVisible()
  })

  test('referral links tab shows 404 for topic without referral program', async ({ page }) => {
    const response = await page.goto(`/${UNLINKED_TOPIC.slug}/${UNLINKED_TOPIC.id}/referral-links`)
    expect(response?.status()).toBe(404)
  })

  test('aside appears on referral program topic page', async ({ page }) => {
    await navigateTo(page, `/${REFERRAL_PROGRAM.slug}/${REFERRAL_PROGRAM.id}/discussions`)

    const aside = page.getByTestId('referral-links-aside-heading')
    await expect(aside).toBeVisible()

    const viewAllLink = page.getByTestId('referral-links-aside-view-all')
    await expect(viewAllLink).toBeVisible()
  })

  test('logged-in user sees add form', async ({ page }) => {
    await navigateTo(page, `/${REFERRAL_PROGRAM.slug}/${REFERRAL_PROGRAM.id}/referral-links`)

    const formHeading = page.getByTestId('referral-link-form-heading')
    await expect(formHeading).toBeVisible()

    const urlInput = page.getByTestId('referral-link-form-url')
    await expect(urlInput).toBeVisible()

    const labelInput = page.getByTestId('referral-link-form-label')
    await expect(labelInput).toBeVisible()
  })

  test('signed-out user does not see add form', async ({ page }) => {
    await page.context().clearCookies()
    await navigateTo(page, `/${REFERRAL_PROGRAM.slug}/${REFERRAL_PROGRAM.id}/referral-links`)

    await expect(page.getByTestId('referral-links-page-heading')).toBeVisible()

    const formHeading = page.getByTestId('referral-link-form-heading')
    await expect(formHeading).toBeHidden()

    const urlInput = page.getByTestId('referral-link-form-url')
    await expect(urlInput).toBeHidden()
  })

  test('Show All button is visible on referral links page for logged-in users', async ({
    page,
  }) => {
    await navigateTo(page, `/${REFERRAL_PROGRAM.slug}/${REFERRAL_PROGRAM.id}/referral-links`)

    const showAllButton = page.getByTestId('referral-links-show-all')
    await expect(showAllButton).toBeVisible()
  })

  test('Show All button loads full list when clicked', async ({ page }) => {
    await navigateTo(page, `/${REFERRAL_PROGRAM.slug}/${REFERRAL_PROGRAM.id}/referral-links`)

    const showAllButton = page.getByTestId('referral-links-show-all')
    await showAllButton.scrollIntoViewIfNeeded()
    await waitForBelowFoldHydration(page)

    await Promise.all([
      page.waitForResponse(
        resp =>
          resp.url().includes('prioritized-referral-links') && resp.url().includes('all=true'),
      ),
      showAllButton.click(),
    ])

    const allLinksHeading = page.getByTestId('referral-links-all-heading')
    await expect(allLinksHeading).toBeVisible()
  })
})

test.describe('Referral Link Form Submission — create', () => {
  let referralProgram: Awaited<ReturnType<typeof insertTestReferralProgram>>
  let contributorId: string

  test.beforeAll(async () => {
    const contributor = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    if (!contributor) throw new Error('Failed to create referral form contributor')
    contributorId = contributor.id
    referralProgram = await insertTestReferralProgram(randomSuffix())
  })

  test.beforeEach(async ({ page }) => {
    await loginAsUser(page, contributorId)
  })

  test('logged-in user can create a referral link', async ({ page }) => {
    await navigateTo(
      page,
      `/referral-program/${referralProgram.referralProgramTopicId}/referral-links`,
    )

    const urlInput = page.getByTestId('referral-link-form-url')
    await urlInput.pressSequentially(referralProgram.url)

    await page.getByTestId('referral-link-form-label').pressSequentially('My test link')

    await page.getByRole('button', { name: 'Add Link' }).click()

    await expect(
      page.locator('[data-sonner-toast]').filter({ hasText: 'Referral link saved' }),
    ).toBeVisible()
  })
})

test.describe('Referral Link Form Submission — validation error', () => {
  let referralProgram: Awaited<ReturnType<typeof insertTestReferralProgram>>
  let contributorId: string

  test.beforeAll(async () => {
    const contributor = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    if (!contributor) throw new Error('Failed to create referral validation contributor')
    contributorId = contributor.id
    referralProgram = await insertTestReferralProgram(randomSuffix())
  })

  test.beforeEach(async ({ page }) => {
    await loginAsUser(page, contributorId)
  })

  test('shows actionable error toast for invalid URL', async ({ page }) => {
    await navigateTo(
      page,
      `/referral-program/${referralProgram.referralProgramTopicId}/referral-links`,
    )

    const urlInput = page.getByTestId('referral-link-form-url')
    await urlInput.pressSequentially('https://not-a-valid-referral-host.example/invalid')

    await page.getByRole('button', { name: 'Add Link' }).click()

    await expect(
      page.locator('[data-sonner-toast]').filter({ hasText: 'Invalid referral link URL' }),
    ).toBeVisible()
  })
})
