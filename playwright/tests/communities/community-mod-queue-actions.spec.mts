import { test, expect } from '../../helpers/test.mts'
import { loginAsUser } from '../../helpers/auth.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { randomSuffix } from '../../helpers/random-id.mts'
import { waitForBelowFoldHydration } from '../../helpers/wait-for-hydration.mts'
import {
  createTestUser,
  insertTestCommunity,
  insertTestCommunityMember,
  insertTestPost,
  insertTestPendingCommunityPostReview,
} from '../../../backend/test-helpers/index.mts'

let moderatorUserId = ''
let communitySlug = ''
let approvePostTitle = ''
let rejectPostTitle = ''

test.beforeAll(async () => {
  const suffix = randomSuffix()

  const owner = await createTestUser({ username: `cma-owner-${suffix}` })
  if (!owner) throw new Error('Failed to create owner')

  const moderator = await createTestUser({ username: `cma-mod-${suffix}` })
  if (!moderator) throw new Error('Failed to create moderator')
  moderatorUserId = moderator.id

  const member = await createTestUser({ username: `cma-member-${suffix}` })
  if (!member) throw new Error('Failed to create member')

  communitySlug = `cma-test-${suffix}`
  const community = await insertTestCommunity({
    createdById: owner.id,
    slug: communitySlug,
    name: `CM Actions Test ${suffix}`,
    post_approval_required_at: new Date(),
  })
  const communityId = community.id

  await insertTestCommunityMember({ communityId, userId: owner.id, role: 'owner' })
  await insertTestCommunityMember({ communityId, userId: moderator.id, role: 'moderator' })
  await insertTestCommunityMember({ communityId, userId: member.id, role: 'member' })

  approvePostTitle = `CMA approve post ${suffix}`
  const approvePostId = await insertTestPost({
    title: approvePostTitle,
    slug: `cma-approve-${suffix}`,
    createdById: member.id,
    markdown: 'Post pending approval by CM.',
    communityId,
  })
  await insertTestPendingCommunityPostReview({
    communityId,
    postId: approvePostId,
    submittedById: member.id,
  })

  rejectPostTitle = `CMA reject post ${suffix}`
  const rejectPostId = await insertTestPost({
    title: rejectPostTitle,
    slug: `cma-reject-${suffix}`,
    createdById: member.id,
    markdown: 'Post pending rejection by CM.',
    communityId,
  })
  await insertTestPendingCommunityPostReview({
    communityId,
    postId: rejectPostId,
    submittedById: member.id,
  })
})

test.describe('Community mod queue — CM action paths', () => {
  test('community moderator can approve a pending post', async ({ page }) => {
    await loginAsUser(page, moderatorUserId)
    await navigateTo(page, `/communities/${communitySlug}/settings/moderation`)

    await page.getByTestId('mod-queue-tab-posts').click()

    const titleLocator = page
      .getByTestId('mod-queue-post-title')
      .filter({ hasText: approvePostTitle })
    await expect(titleLocator).toBeVisible()

    const postCard = page.getByTestId('mod-queue-post-card').filter({ has: titleLocator })
    const approveButton = postCard.getByTestId('mod-queue-approve')
    await expect(approveButton).toBeVisible()
    await approveButton.scrollIntoViewIfNeeded()
    await waitForBelowFoldHydration(page)

    await approveButton.click()
    await expect(titleLocator).not.toBeAttached()
  })

  test('community moderator can reject a pending post with reason', async ({ page }) => {
    await loginAsUser(page, moderatorUserId)
    await navigateTo(page, `/communities/${communitySlug}/settings/moderation`)

    await page.getByTestId('mod-queue-tab-posts').click()

    const titleLocator = page
      .getByTestId('mod-queue-post-title')
      .filter({ hasText: rejectPostTitle })
    await expect(titleLocator).toBeVisible()

    const postCard = page.getByTestId('mod-queue-post-card').filter({ has: titleLocator })
    const rejectButton = postCard.getByTestId('mod-queue-reject')
    await expect(rejectButton).toBeVisible()
    await rejectButton.scrollIntoViewIfNeeded()
    await waitForBelowFoldHydration(page)

    await rejectButton.click()

    const reasonTextarea = postCard.getByTestId('mod-queue-rejection-reason')
    await expect(reasonTextarea).toBeVisible()
    await reasonTextarea.pressSequentially('Does not meet community guidelines.')

    const confirmButton = postCard.getByTestId('mod-queue-reject-confirm')
    await expect(confirmButton).toBeVisible()
    await confirmButton.click()

    await expect(titleLocator).not.toBeAttached()
  })
})
