import { expect, test } from '../../helpers/test.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { AUTH_STATE } from '../../helpers/auth-state.mts'
import { loginAsUser } from '../../helpers/auth.mts'
import { voteBinaryChoice } from '../../helpers/semantic-vote.mts'
import { waitForBelowFoldHydration } from '../../helpers/wait-for-hydration.mts'
import {
  CONTRIBUTING_USER_AGE_MS,
  createTestUserWithAge,
} from '../../../backend/test-helpers/index.mts'

// Uses seed data with entity relations:
// - Discussion 1: '019c64e6-f720-7001-a001-000000000001'
//   - Related to American Express Gold topic
//   - Related to Review 1 post
// - Review 1: '019c64e6-f720-7002-a002-000000000001'
//   - Related to Capital One Venture topic
// - Chase Sapphire topic: '019c64e6-f710-74cb-b36d-130af8ff1067'
//   - Related to American Express Gold topic
//   - FAQ: Discussion 1
// - American Express Gold topic: '019c64e6-f713-7bf3-8b1e-a869aa7c9cf1'
//   - Related to Capital One Venture topic
//   - FAQ: Discussion 2

const DISCUSSION_ID = '019c64e6-f720-7001-a001-000000000001'
const CHASE_TOPIC_ID = '019c64e6-f710-74cb-b36d-130af8ff1067'
const AMEX_TOPIC_SLUG = 'american-express-gold' // uuid: 019c64e6-f713-7bf3-8b1e-a869aa7c9cf1

let contributorId: string

test.beforeAll(async () => {
  const contributor = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
  if (!contributor) throw new Error('Failed to create tag vote contributor')
  contributorId = contributor.id
})

test.describe('Tag Asides', () => {
  test.use({ storageState: AUTH_STATE })

  test('shows related topics aside on discussion page', async ({ page }) => {
    await navigateTo(page, `/discussion/${DISCUSSION_ID}`)

    // Categories aside should appear (only on desktop lg+)
    await page.setViewportSize({ width: 1280, height: 720 })

    // Should show Categories heading (post → category → topic relations)
    await expect(page.getByTestId('post-related-topics-heading')).toBeVisible()

    // Should show American Express Gold (seeded relation) - scope to aside
    const relatedTopicsSectionDisc = page.getByTestId('post-related-topics-aside')
    await expect(
      relatedTopicsSectionDisc
        .getByTestId('tag-item-link')
        .filter({ hasText: 'American Express Gold' }),
    ).toBeVisible()
  })

  test('shows related posts aside on discussion page', async ({ page }) => {
    await navigateTo(page, `/discussion/${DISCUSSION_ID}`)
    await page.setViewportSize({ width: 1280, height: 720 })

    // Should show Related Posts heading
    await expect(page.getByTestId('post-related-posts-heading')).toBeVisible()

    // Should show Review 1 (seeded relation)
    await expect(
      page
        .getByTestId('tag-item-link')
        .filter({ hasText: /Great travel card/i })
        .first(),
    ).toBeVisible()
  })

  test('shows aside below content on mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 })
    await navigateTo(page, `/discussion/${DISCUSSION_ID}`)

    // Non-infinite-scroll detail pages render aside below main content on mobile
    // (full-width block, not a sidebar column). Scroll down to find it.
    const categoriesHeading = page.getByTestId('post-related-topics-heading')
    await categoriesHeading.scrollIntoViewIfNeeded()
    await expect(categoriesHeading).toBeVisible()
  })

  test('shows manage button when logged in', async ({ page }) => {
    await navigateTo(page, `/discussion/${DISCUSSION_ID}`)
    await page.setViewportSize({ width: 1280, height: 720 })

    // Manage button should be visible
    const manageButton = page
      .getByTestId('post-related-topics-aside')
      .getByRole('button', { name: 'Manage' })
    await expect(manageButton).toBeVisible()
  })

  test('hides manage button when logged out', async ({ page }) => {
    await page.context().clearCookies()
    await navigateTo(page, `/discussion/${DISCUSSION_ID}`)
    await page.setViewportSize({ width: 1280, height: 720 })

    // Manage button should NOT be visible when logged out
    await expect(
      page.getByTestId('post-related-topics-aside').getByRole('button', { name: 'Manage' }),
    ).toBeHidden()
  })

  test('manage button opens tags modal with full tags link', async ({ page }) => {
    await navigateTo(page, `/discussion/${DISCUSSION_ID}`)
    await page.setViewportSize({ width: 1280, height: 720 })
    const startingUrl = page.url()

    // Click Manage button
    const manageButton = page
      .getByTestId('post-related-topics-aside')
      .getByRole('button', { name: 'Manage' })
    await manageButton.click()

    const dialog = page.getByRole('dialog', { name: 'Manage' })
    await expect(dialog).toBeVisible()
    await expect(dialog.getByRole('link', { name: 'Manage all tags' })).toHaveAttribute(
      'href',
      `/discussion/${DISCUSSION_ID}/tags/topic`,
    )
    expect(page.url()).toBe(startingUrl)
  })

  test('shows categories aside on topic page when authenticated', async ({ page }) => {
    await navigateTo(page, `/card/${CHASE_TOPIC_ID}`)
    await page.setViewportSize({ width: 1280, height: 720 })

    // Category tags aside renders for authenticated users on all topic types
    await expect(page.getByTestId('category-tags-aside')).toBeVisible()
  })

  test('shows related topics aside on topic page', async ({ page }) => {
    await navigateTo(page, `/card/${CHASE_TOPIC_ID}`)
    await page.setViewportSize({ width: 1280, height: 720 })

    // Should show Related Topics heading
    await expect(page.getByTestId('topic-related-topics-heading')).toBeVisible()

    // Should show American Express Gold (seeded relation) - scope to aside to avoid strict mode
    const relatedTopicsSectionTopic = page.getByTestId('topic-related-topics-aside')
    await expect(
      relatedTopicsSectionTopic
        .getByTestId('tag-item-link')
        .filter({ hasText: 'American Express Gold' }),
    ).toBeVisible()
  })

  test('shows FAQ posts aside on topic page', async ({ page }) => {
    await navigateTo(page, `/card/${CHASE_TOPIC_ID}`)
    await page.setViewportSize({ width: 1280, height: 720 })

    // Should show FAQ Posts heading
    await expect(page.getByTestId('topic-faq-posts-heading')).toBeVisible()

    // Should show Discussion 1 (seeded FAQ relation) - scope to aside to avoid strict mode violation
    const faqAside = page.getByTestId('topic-faq-posts-aside')
    await expect(
      faqAside
        .getByTestId('tag-item-link')
        .filter({ hasText: /What are the best ways to redeem/i }),
    ).toBeVisible()
  })

  test('hides aside when no relations exist', async ({ page }) => {
    await navigateTo(page, `/discussion/019c64e6-f720-7001-a001-000000000003`)
    await page.setViewportSize({ width: 1280, height: 720 })

    // Should NOT show Categories aside if there are no relations
    await expect(page.getByTestId('post-related-topics-heading')).toBeHidden()
  })

  test('shows voting buttons when logged in', async ({ page }) => {
    await loginAsUser(page, contributorId)
    await navigateTo(page, `/discussion/${DISCUSSION_ID}`)
    await page.setViewportSize({ width: 1280, height: 720 })

    await expect(voteBinaryChoice(page, 'tag-vote', 'confirm').first()).toBeVisible()
    await expect(voteBinaryChoice(page, 'tag-vote', 'dispute').first()).toBeVisible()
  })

  test('hides voting buttons when logged out', async ({ page }) => {
    await page.context().clearCookies()
    await navigateTo(page, `/discussion/${DISCUSSION_ID}`)
    await page.setViewportSize({ width: 1280, height: 720 })
    await waitForBelowFoldHydration(page)

    await expect(voteBinaryChoice(page, 'tag-vote', 'confirm')).toHaveCount(0)
    await expect(voteBinaryChoice(page, 'tag-vote', 'dispute')).toHaveCount(0)
  })

  test('renders semantic tag vote controls with raw counts', async ({ page }) => {
    await loginAsUser(page, contributorId)
    await navigateTo(page, `/discussion/${DISCUSSION_ID}`)
    await page.setViewportSize({ width: 1280, height: 720 })
    await waitForBelowFoldHydration(page)

    const confirmButton = voteBinaryChoice(page, 'tag-vote', 'confirm').first()
    await expect(confirmButton).toBeVisible()
    const tagVote = confirmButton.locator('..')
    await expect(tagVote.getByTestId('vote-count-up')).toBeVisible()
    await expect(tagVote.getByTestId('vote-count-down')).toBeVisible()
  })

  test('tag links navigate to entity detail page', async ({ page }) => {
    await navigateTo(page, `/discussion/${DISCUSSION_ID}`)
    await page.setViewportSize({ width: 1280, height: 720 })

    // Click on American Express Gold link in the aside
    await page
      .getByTestId('post-related-topics-aside')
      .getByTestId('tag-item-link')
      .filter({ hasText: 'American Express Gold' })
      .click()

    // Should navigate to the topic page (redirects to default posts tab)
    await expect(page).toHaveURL(`/card/${AMEX_TOPIC_SLUG}/posts`)
  })

  test('shows type badge for relations', async ({ page }) => {
    await navigateTo(page, `/discussion/${DISCUSSION_ID}`)
    await page.setViewportSize({ width: 1280, height: 720 })

    // Should show humanized type badge — American Express Gold is topic_type 'card' → 'Card'
    const relatedTopicsSection = page.getByTestId('post-related-topics-aside')
    await expect(
      relatedTopicsSection.getByTestId('tag-item-type-badge').filter({ hasText: 'Card' }).first(),
    ).toBeVisible()
  })
})
