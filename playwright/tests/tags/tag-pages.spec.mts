import { expect, test } from '../../helpers/test.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { AUTH_STATE } from '../../helpers/auth-state.mts'
import { loginAsUser } from '../../helpers/auth.mts'
import { insertTestTopic } from '../../helpers/insert-test-topic.mts'
import { randomSuffix } from '../../helpers/random-id.mts'
import { voteBinaryChoice } from '../../helpers/semantic-vote.mts'
import {
  CONTRIBUTING_USER_AGE_MS,
  createTestUserWithAge,
  insertTestPost,
} from '../../../backend/test-helpers/index.mts'
import { requireTestValue } from '../../helpers/assertions.mts'
import { beginTransaction } from '../../../backend/data-stores/psql/index.mts'
import { seedPlaywrightPublisherTypeTopics } from '../../../backend/scripts/seeds/playwright-test-data/core-publisher-type-topics.mts'

// Uses seed data:
// - Test user: '019f0000-0000-7000-8000-000000000000'
// - Discussion 1: '019c64e6-f720-7001-a001-000000000001' (has tags)
// - Discussion 3: '019c64e6-f720-7001-a001-000000000003' (no tags — empty state, do NOT mutate)
// - Review 1: '019c64e6-f720-7002-a002-000000000001'
// - Chase Sapphire Preferred: '019c64e6-f710-74cb-b36d-130af8ff1067'
// - Capital One Venture: '019c64e6-f716-722f-b05c-f4c4f7b93cd0'

const DISCUSSION_ID = '019c64e6-f720-7001-a001-000000000001'
const DISCUSSION_3_ID = '019c64e6-f720-7001-a001-000000000003'
const REVIEW_ID = '019c64e6-f720-7002-a002-000000000001'
const ARTICLE_ID = '019c64e6-f720-7005-a005-000000000001'
const ARTICLE_SLUG = 'playwright-article-fixture'
const CHASE_TOPIC_ID = '019c64e6-f710-74cb-b36d-130af8ff1067'

let contributorId: string
let sourceTopicId: string

test.beforeAll(async () => {
  await using transaction = await beginTransaction()
  await seedPlaywrightPublisherTypeTopics(transaction)
  await transaction.commit()
  contributorId = requireTestValue(
    await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS),
    'Failed to create tag page contributor',
  ).id

  const suffix = randomSuffix()
  const sourceTopic = await insertTestTopic(
    `Tag Page Source ${suffix}`,
    `tag-page-source-${suffix}`,
    'rss_feed',
  )
  sourceTopicId = sourceTopic.id
})

test.describe('Tag Pages', () => {
  test.use({ storageState: AUTH_STATE })

  test('redirects to login when not authenticated', async ({ page }) => {
    await page.context().clearCookies()
    await navigateTo(page, `/discussion/${DISCUSSION_ID}/tags/topic`)

    // Should redirect to login
    await expect(page).toHaveURL('/login')
  })

  test('shows tag management page for discussion when authenticated', async ({ page }) => {
    await navigateTo(page, `/discussion/${DISCUSSION_ID}/tags/topic`)

    // Active tab heading should show "Category Topics" (first postTagTab)
    await expect(page.getByTestId('manage-tags-active-heading')).toHaveText('Category Topics')

    // Current tags section should show
    await expect(page.getByTestId('manage-tags-current-heading')).toContainText('Category Topics')

    await expect(page.getByTestId('manage-post-tags-content')).toBeVisible()
  })

  test('shows tag management page for review when authenticated', async ({ page }) => {
    await navigateTo(page, `/review/${REVIEW_ID}/tags/topic`)

    // Active tab heading should show "Category Topics" (first postTagTab)
    await expect(page.getByTestId('manage-tags-active-heading')).toHaveText('Category Topics')
  })

  test('shows tag management page for topic when authenticated', async ({ page }) => {
    await navigateTo(page, `/card/${CHASE_TOPIC_ID}/tags/topic`)

    await expect(page.getByTestId('manage-tags-active-heading')).toHaveText('Related Topics')
  })

  test('shows FAQ tag management page for topic', async ({ page }) => {
    await navigateTo(page, `/card/${CHASE_TOPIC_ID}/tags/post`)

    await expect(page.getByTestId('manage-tags-active-heading')).toHaveText('FAQ Posts')
  })

  test('comments tab navigates back to entity detail page', async ({ page }) => {
    await navigateTo(page, `/discussion/${DISCUSSION_ID}/tags/topic`)

    const commentsTab = page.getByTestId('post-detail-tab-comments')
    await expect(commentsTab).toBeVisible()
    await expect(commentsTab).toContainText(/Comments \(\d+\)/)
    await commentsTab.click()

    // Should navigate back to discussion
    await expect(page).toHaveURL(`/discussion/${DISCUSSION_ID}`)
  })

  test('article manage-tag tab changes preserve scroll position', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 320 })
    await navigateTo(page, `/article/${ARTICLE_ID}/tags/topic`)

    const manageTagsTab = page.getByTestId('post-detail-tab-manage-tags')
    await expect(manageTagsTab).toBeVisible()
    await manageTagsTab.scrollIntoViewIfNeeded()

    const beforeTabChangeScrollY = await page.evaluate(() => window.scrollY)
    expect(beforeTabChangeScrollY).toBeGreaterThan(0)

    await manageTagsTab.click()
    await page.getByTestId('manage-tags-tab-post').click()

    await expect(page).toHaveURL(`/article/${ARTICLE_SLUG}/tags/post`)
    await expect(page.getByTestId('manage-tags-active-heading')).toHaveText('Related Posts')

    const afterTabChangeScrollY = await page.evaluate(() => window.scrollY)
    expect(afterTabChangeScrollY).toBeGreaterThan(0)
  })

  test('displays existing tags with semantic vote controls', async ({ page }) => {
    await loginAsUser(page, contributorId)
    await navigateTo(page, `/discussion/${DISCUSSION_ID}/tags/topic`)

    // Scope to the "Current Category Topics tags" section to avoid matching aside elements
    const currentTagsSection = page.getByTestId('manage-tags-current-section')
    await expect(currentTagsSection).toBeVisible()

    // Should show the American Express Gold tag that was seeded
    const amexLink = currentTagsSection
      .getByTestId('tag-item-link')
      .filter({ hasText: 'American Express Gold' })
    await expect(amexLink).toBeVisible()

    await expect(
      voteBinaryChoice(amexLink.locator('../..'), 'tag-vote', 'confirm').first(),
    ).toBeVisible()
  })

  test('shows empty state when no tags exist', async ({ page }) => {
    // Discussion 3 has no topic tags (intentionally untagged in seed data)
    await navigateTo(page, `/discussion/${DISCUSSION_3_ID}/tags/topic`)

    // Scope to the Current Category Topics tags section to avoid matching text elsewhere
    const currentTagsSection = page.getByTestId('manage-tags-current-section')
    await expect(currentTagsSection).toBeVisible()

    // Empty state text should be visible within the current tags section
    await expect(currentTagsSection.getByTestId('tag-list-empty')).toBeVisible()
  })

  test('autocomplete shows search results', async ({ page }) => {
    await navigateTo(page, `/discussion/${DISCUSSION_ID}/tags/topic`)

    // "Chase Sapphire Preferred" is already seeded on DISCUSSION_ID and excluded from results.
    // Search for "Sapphire Preferred" which surfaces "Chase Sapphire Preferred Status" (not yet tagged).
    const searchInput = page.getByTestId('tag-autocomplete-input-topic')
    await searchInput.pressSequentially('Sapphire Preferred')

    await expect(
      page
        .getByTestId('tag-autocomplete-item-topic')
        .filter({ hasText: /^Chase Sapphire Preferred Status$/ }),
    ).toBeVisible()
  })

  test('can select tag from autocomplete', async ({ page }) => {
    await navigateTo(page, `/discussion/${DISCUSSION_ID}/tags/topic`)

    // Type in the search box
    const searchInput = page.getByTestId('tag-autocomplete-input-topic')
    await searchInput.pressSequentially('Capital')

    await expect(
      page.getByTestId('tag-autocomplete-item-topic').filter({ hasText: /^Capital One Venture$/ }),
    ).toBeVisible()
  })

  test('auto-submits on tag selection', async ({ page }) => {
    const suffix = randomSuffix()
    const postId = await insertTestPost({
      title: `Tag mutation discussion ${suffix}`,
      slug: `tag-mutation-discussion-${suffix}`,
      createdById: contributorId,
      markdown: 'A fresh discussion for tag mutation.',
      postType: 'discussion',
    })
    await loginAsUser(page, contributorId)
    await navigateTo(page, `/discussion/${postId}/tags/topic`)

    const currentTagsSection = page.getByTestId('manage-tags-current-section')
    await expect(currentTagsSection).toBeVisible()

    const chaseLink = currentTagsSection
      .getByTestId('tag-item-link')
      .filter({ hasText: 'Chase Sapphire Preferred' })

    const searchInput = page.getByTestId('tag-autocomplete-input-topic')
    await searchInput.pressSequentially('Sapphire Preferred')

    await page
      .getByTestId('tag-autocomplete-item-topic')
      .filter({ hasText: /^Chase Sapphire Preferred$/ })
      .first()
      .click()

    await expect(chaseLink).toBeVisible()
  })

  test('validates invalid object type', async ({ page }) => {
    // Try to access with invalid object type
    const response = await page.goto(`/discussion/${DISCUSSION_ID}/tags/invalid`)

    // Should show 404 Not Found
    expect(response?.status()).toBe(404)
  })

  test('returns 404 for publisher type tags on non-source topics', async ({ page }) => {
    const response = await page.goto(`/card/${CHASE_TOPIC_ID}/tags/publisher_type`)

    expect(response?.status()).toBe(404)
  })

  test('shows Manage Tags dropdown on topic page for authenticated users', async ({ page }) => {
    await navigateTo(page, `/card/${CHASE_TOPIC_ID}/posts`)

    // TopicDetailTabs renders Manage Tags dropdown for authenticated users
    await expect(page.getByTestId('topic-detail-tab-manage-tags')).toBeVisible()
  })

  test('does not show Manage Tags dropdown on topic page when not authenticated', async ({
    page,
  }) => {
    await page.context().clearCookies()
    await navigateTo(page, `/card/${CHASE_TOPIC_ID}/posts`)

    // Manage Tags dropdown should not be visible for anonymous users
    await expect(page.getByTestId('topic-detail-tab-manage-tags')).toBeHidden()
  })

  test('Manage Tags dropdown on topic navigates to topic tags page', async ({ page }) => {
    await navigateTo(page, `/card/${CHASE_TOPIC_ID}/posts`)

    const manageTagsTab = page.getByTestId('topic-detail-tab-manage-tags')
    await expect(manageTagsTab).toBeVisible()
    await manageTagsTab.click()
    await page.getByTestId('manage-tags-tab-topic').click()

    // Should navigate to the topic tags management page
    await expect(page).toHaveURL(`/card/${CHASE_TOPIC_ID}/tags/topic`)

    // Manage Tags should be active on the tags page
    await expect(page.getByTestId('topic-detail-tab-manage-tags')).toHaveAttribute(
      'data-active',
      'true',
    )
  })

  test('publisher_type tab shows a closed-enum Select instead of free-form autocomplete', async ({
    page,
  }) => {
    await navigateTo(page, `/source/${sourceTopicId}/tags/publisher_type`)

    // The fixed Select replaces the free-form autocomplete
    await expect(page.getByTestId('publisher-type-select')).toBeVisible()
    // The free-form autocomplete should not be present
    await expect(page.getByTestId('tag-autocomplete-input-topic')).toBeHidden()
  })

  test('publisher_type Select shows seeded publisher type options', async ({ page }) => {
    await navigateTo(page, `/source/${sourceTopicId}/tags/publisher_type`)

    // Open the Select to reveal options in the portal
    const trigger = page.getByTestId('publisher-type-select')
    await expect(trigger).toBeVisible()
    await trigger.click()

    // At least the Blog option should be visible as a seeded publisher type
    await expect(page.getByTestId('publisher-type-option-blog')).toBeVisible()
  })

  test('landing_page tab shows URL autocomplete', async ({ page }) => {
    await navigateTo(page, `/card/${CHASE_TOPIC_ID}/tags/landing_page`)
    // Landing Page uses the URL autocomplete, not the publisher-type Select
    await expect(page.getByTestId('tag-autocomplete-input-url')).toBeVisible()
  })

  test('terms_of_service tab shows URL autocomplete', async ({ page }) => {
    await navigateTo(page, `/card/${CHASE_TOPIC_ID}/tags/terms_of_service`)
    // Terms of Service uses the URL autocomplete
    await expect(page.getByTestId('tag-autocomplete-input-url')).toBeVisible()
  })
})
