import { test, expect } from '../../helpers/test.mts'
import { loginAsUser } from '../../helpers/auth.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { randomSuffix } from '../../helpers/random-id.mts'
import { waitForBelowFoldHydration } from '../../helpers/wait-for-hydration.mts'
import {
  createTestUser,
  insertTestCommunity,
  insertTestCommunityMember,
  insertTestModerationReport,
  insertTestPendingCommunityPostReview,
  insertTestPost,
} from '../../../backend/test-helpers/index.mts'

let ownerUserId = ''
let communitySlug = ''
let pendingPostTitle = ''
let reportedPostTitle = ''

test.beforeAll(async () => {
  const suffix = randomSuffix()
  const owner = await createTestUser({ username: `mod-discuss-owner-${suffix}` })
  if (!owner) throw new Error('Failed to create owner')
  ownerUserId = owner.id

  const reporter = await createTestUser({ username: `mod-discuss-reporter-${suffix}` })
  if (!reporter) throw new Error('Failed to create reporter')

  communitySlug = `mod-discuss-${suffix}`
  const community = await insertTestCommunity({
    createdById: owner.id,
    slug: communitySlug,
    name: `Mod Discuss Test ${suffix}`,
    post_approval_required_at: new Date(),
  })
  await insertTestCommunityMember({
    communityId: community.id,
    userId: owner.id,
    role: 'owner',
  })
  await insertTestCommunityMember({
    communityId: community.id,
    userId: reporter.id,
    role: 'member',
  })

  pendingPostTitle = `Pending discussion ${suffix}`
  const pendingPostId = await insertTestPost({
    title: pendingPostTitle,
    slug: `pending-discussion-${suffix}`,
    createdById: reporter.id,
    markdown: 'Post awaiting moderation discussion.',
    communityId: community.id,
  })
  await insertTestPendingCommunityPostReview({
    communityId: community.id,
    postId: pendingPostId,
    submittedById: reporter.id,
  })

  reportedPostTitle = `Reported discussion ${suffix}`
  const reportedPostId = await insertTestPost({
    title: reportedPostTitle,
    slug: `reported-discussion-${suffix}`,
    createdById: reporter.id,
    markdown: 'Post reported for moderation discussion.',
    communityId: community.id,
  })
  await insertTestModerationReport({
    reporterUserId: reporter.id,
    entityType: 'post',
    entityId: reportedPostId,
    reason: 'spam',
  })
})

test.describe('Community mod queue — internal discussions', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsUser(page, ownerUserId)
    await navigateTo(page, `/communities/${communitySlug}/settings/moderation`)
  })

  test('post Discuss navigates in the current tab and Back returns to the queue', async ({
    page,
  }) => {
    await page.getByTestId('mod-queue-tab-posts').click()
    const postTitle = page.getByTestId('mod-queue-post-title').filter({ hasText: pendingPostTitle })
    const postCard = page.getByTestId('mod-queue-post-card').filter({ has: postTitle })
    await expect(postCard).toBeVisible()
    await postCard.getByTestId('discuss-post-button').scrollIntoViewIfNeeded()
    await waitForBelowFoldHydration(page)

    const pageCount = page.context().pages().length
    await postCard.getByTestId('discuss-post-button').click()

    await expect(page).toHaveURL(/\/messages\/[^/]+$/)
    expect(page.context().pages()).toHaveLength(pageCount)
    await page.goBack()
    await expect(page).toHaveURL(
      new RegExp(`/communities/${communitySlug}/settings/moderation(?:\\?.*)?$`),
    )
  })

  test('report Discuss navigates in the current tab and Back returns to the queue', async ({
    page,
  }) => {
    const reportCard = page
      .getByTestId('mod-queue-report-card')
      .filter({ hasText: reportedPostTitle })
    await expect(reportCard).toBeVisible()
    await reportCard.getByTestId('discuss-report-button').scrollIntoViewIfNeeded()
    await waitForBelowFoldHydration(page)

    const pageCount = page.context().pages().length
    await reportCard.getByTestId('discuss-report-button').click()

    await expect(page).toHaveURL(/\/messages\/[^/]+$/)
    expect(page.context().pages()).toHaveLength(pageCount)
    await page.goBack()
    await expect(page).toHaveURL(
      new RegExp(`/communities/${communitySlug}/settings/moderation(?:\\?.*)?$`),
    )
  })
})
