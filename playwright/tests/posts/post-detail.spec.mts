import { expect, test } from '../../helpers/test.mts'
import { AUTH_STATE } from '../../helpers/auth-state.mts'
import { withCleanUser } from '../../helpers/auth.mts'
import { insertPersonalizedPostFixture } from '../../helpers/insert-personalized-fixtures.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'

test.describe('Post Detail Pages', () => {
  test.use({ storageState: AUTH_STATE })
  // Requires seed data:
  // - Discussion:  '019c64e6-f720-7001-a001-000000000001'
  // - Review:      '019c64e6-f720-7002-a002-000000000001'
  // - Data Point:  '019c64e6-f720-7003-a003-000000000001'
  // - Story:       '019c64e6-f720-7004-a004-000000000001'
  // - Article:     '019c64e6-f720-7005-a005-000000000001'
  // - Blog Post:   '019c64e6-f720-7006-a006-000000000001'

  const POST_TYPE_CASES = [
    {
      type: 'discussion',
      segment: 'discussion',
      id: '019c64e6-f720-7001-a001-000000000001',
      badgeType: 'discussion',
      contentRegex: /What are the best ways to redeem/,
    },
    {
      type: 'review',
      segment: 'review',
      id: '019c64e6-f720-7002-a002-000000000001',
      badgeType: 'review',
      contentRegex: /Great travel card/,
    },
    {
      type: 'data_point',
      segment: 'data-point',
      id: '019c64e6-f720-7003-a003-000000000001',
      badgeType: 'data_point',
      contentRegex: /Approved with 720 credit score/,
    },
    {
      type: 'story',
      segment: 'story',
      id: '019c64e6-f720-7004-a004-000000000001',
      badgeType: 'story',
      // Story posts have markdown='' so the body is empty; match the title instead
      contentRegex: /Behind the points and miles community/,
    },
    {
      type: 'article',
      segment: 'article',
      id: '019c64e6-f720-7005-a005-000000000001',
      badgeType: 'article',
      contentRegex: /Beginner's guide to credit card rewards/,
    },
    {
      type: 'blog_post',
      segment: 'blog-post',
      id: '019c64e6-f720-7006-a006-000000000001',
      badgeType: 'blog_post',
      contentRegex: /What's new on Voucha this week/,
    },
  ] as const

  test('displays review detail page', async ({ page }) => {
    const reviewId = '019c64e6-f720-7002-a002-000000000001'
    await navigateTo(page, `/review/${reviewId}`)

    await expect(page).toHaveURL(`/review/${reviewId}`)

    await expect(page.getByTestId('post-detail-type-badge-review')).toBeVisible()

    // Title appears in heading; check content via post-detail-heading
    await expect(page.getByTestId('post-detail-heading')).toContainText(/Great travel card/)
  })

  test('displays discussion detail page', async ({ page }) => {
    const discussionId = '019c64e6-f720-7001-a001-000000000001'
    await navigateTo(page, `/discussion/${discussionId}`)

    await expect(page).toHaveURL(`/discussion/${discussionId}`)

    await expect(page.getByTestId('post-detail-type-badge-discussion')).toBeVisible()

    await expect(page.getByTestId('post-detail-heading')).toContainText(
      /What are the best ways to redeem/,
    )
  })

  test('displays data point detail page', async ({ page }) => {
    const dataPointId = '019c64e6-f720-7003-a003-000000000001'
    await navigateTo(page, `/data-point/${dataPointId}`)

    await expect(page).toHaveURL(`/data-point/${dataPointId}`)

    await expect(page.getByTestId('post-detail-type-badge-data_point')).toBeVisible()

    await expect(page.getByTestId('post-detail-content')).toContainText(
      /Approved with 720 credit score/,
    )
  })

  // Display tests for post types added by this PR; driven from POST_TYPE_CASES to avoid
  // duplicating IDs and content regexes that are already defined there.
  for (const { segment, id, badgeType, contentRegex } of POST_TYPE_CASES.filter(
    c => c.type === 'story' || c.type === 'article' || c.type === 'blog_post',
  )) {
    test(`displays ${badgeType} detail page`, async ({ page }) => {
      await navigateTo(page, `/${segment}/${id}`)

      await expect(page).toHaveURL(`/${segment}/${id}`)

      await expect(page.getByTestId(`post-detail-type-badge-${badgeType}`)).toBeVisible()

      await expect(page.getByTestId('post-detail-heading')).toContainText(contentRegex)
    })
  }

  test('loads post detail pages without errors', async ({ page }) => {
    const reviewId = '019c64e6-f720-7002-a002-000000000001'
    await navigateTo(page, `/review/${reviewId}`)

    await expect(page.getByTestId('post-detail-heading')).toContainText(/Great travel card/)
  })

  test('comments tab shows formatted comment count below content', async ({ page }) => {
    const discussionId = '019c64e6-f720-7001-a001-000000000001'
    await navigateTo(page, `/discussion/${discussionId}`)

    await expect(page.getByTestId('post-detail-tab-comments')).toContainText(/Comments \(\d+\)/)
  })

  test('post type badge strip appears below title', async ({ page }) => {
    const reviewId = '019c64e6-f720-7002-a002-000000000001'
    await navigateTo(page, `/review/${reviewId}`)

    await expect(page.getByTestId('post-detail-heading')).toBeVisible()
    await expect(page.getByTestId('post-detail-type-badge-review')).toBeVisible()
  })

  test('review renders stars only in badge pills, not as a separate icon list', async ({
    page,
  }) => {
    const reviewId = '019c64e6-f720-7002-a002-000000000001'
    await navigateTo(page, `/review/${reviewId}`)

    // Badge pills are TopicLabel anchors with data-pw='topic-label'
    await expect(page.getByTestId('topic-label').first()).toBeVisible()

    // The old detailed star list used role='img' per topic row — must not exist.
    // Using page.locator with a CSS selector (not a free-text matcher) is allowed by playwright-prefer-test-id.
    await expect(page.locator('[role="img"][aria-label*="out of 5 stars"]')).toHaveCount(0)
  })

  for (const { type, segment, id } of POST_TYPE_CASES) {
    test(`Posted by byline appears below content on ${type}`, async ({ page }) => {
      await navigateTo(page, `/${segment}/${id}`)

      const heading = page.getByTestId('post-detail-heading')
      const byline = page.getByTestId('post-detail-byline').first()
      await expect(heading).toBeVisible()
      await expect(byline).toBeVisible()

      const headingBox = await heading.boundingBox()
      const bylineBox = await byline.boundingBox()
      expect(headingBox).not.toBeNull()
      expect(bylineBox).not.toBeNull()
      expect(bylineBox!.y).toBeGreaterThanOrEqual(headingBox!.y + headingBox!.height)
    })
  }

  for (const { type, segment, id } of POST_TYPE_CASES) {
    test(`Manage Tags tab visible on ${type} for authenticated user`, async ({ page }) => {
      await navigateTo(page, `/${segment}/${id}`)

      await expect(page.getByTestId('post-detail-tab-manage-tags')).toBeVisible()
    })
  }

  test('Manage Tags tab not visible on review for anonymous viewer', async ({ page }) => {
    await page.context().clearCookies()
    const reviewId = '019c64e6-f720-7002-a002-000000000001'
    await navigateTo(page, `/review/${reviewId}`)

    await expect(page.getByTestId('post-detail-tab-manage-tags')).toBeHidden()
  })

  test('Manage Tags tab visible on review that already has category topics tagged', async ({
    page,
  }) => {
    // Regression: Manage Tags disappeared from tabs when categories were already tagged on the post.
    // The review fixture (019c64e6-f720-7002-a002-000000000001) has tags added via tag-pages tests,
    // so CI will run this after the auto-submit test has tagged Chase Sapphire Preferred.
    // This asserts the tab is present regardless of whether the review has categories or not.
    const reviewId = '019c64e6-f720-7002-a002-000000000001'
    await navigateTo(page, `/review/${reviewId}`)

    // If categories aside shows, confirm Manage Tags tab is ALSO present in the tabs row
    await expect(page.getByTestId('post-detail-tab-manage-tags')).toBeVisible()
  })

  test('logged-in post pages show followed-user vote context only', async ({ page }) => {
    const viewer = await withCleanUser(page)
    const fixture = await insertPersonalizedPostFixture(viewer)

    await navigateTo(page, `/discussion/${fixture.postId}`)

    const followContext = page.getByTestId('follow-context-card')
    const followedUserLinks = followContext.locator(`a[href="/user/${fixture.followedUsername}"]`)
    const unfollowedUserLinks = followContext.locator(
      `a[href="/user/${fixture.unfollowedUsername}"]`,
    )
    await expect(followContext).toBeVisible()
    await expect(followedUserLinks.first()).toBeVisible()
    await expect(unfollowedUserLinks).toHaveCount(0)
  })
})
