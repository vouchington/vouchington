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
  insertTestCommunityPostReview,
} from '../../../backend/test-helpers/index.mts'

let ownerUserId = ''
let moderatorUserId = ''
let communityId = ''
let communitySlug = ''
let publishedPostId = ''
let unpublishPostId = ''
let moderatorUnpublishPostId = ''

test.beforeAll(async () => {
  const suffix = randomSuffix()

  const owner = await createTestUser({ username: `unpublish-owner-${suffix}` })
  if (!owner) throw new Error('Failed to create owner user')
  ownerUserId = owner.id

  const moderator = await createTestUser({ username: `unpublish-mod-${suffix}` })
  if (!moderator) throw new Error('Failed to create moderator user')
  moderatorUserId = moderator.id

  communitySlug = `unpublish-test-${suffix}`
  const community = await insertTestCommunity({
    createdById: owner.id,
    slug: communitySlug,
    name: `Unpublish Test ${suffix}`,
    post_approval_required_at: new Date(),
  })
  communityId = community.id

  await insertTestCommunityMember({ communityId, userId: owner.id, role: 'owner' })
  await insertTestCommunityMember({ communityId, userId: moderatorUserId, role: 'moderator' })

  publishedPostId = await insertTestPost({
    title: `Unpublish button test post ${suffix}`,
    slug: `unpublish-btn-post-${suffix}`,
    createdById: owner.id,
    markdown: 'Post to check unpublish button visibility.',
    communityId,
  })
  await insertTestCommunityPostReview({
    communityId,
    postId: publishedPostId,
    submittedById: owner.id,
  })

  unpublishPostId = await insertTestPost({
    title: `Unpublish action test post ${suffix}`,
    slug: `unpublish-action-post-${suffix}`,
    createdById: owner.id,
    markdown: 'Post to actually unpublish.',
    communityId,
  })
  await insertTestCommunityPostReview({
    communityId,
    postId: unpublishPostId,
    submittedById: owner.id,
  })

  moderatorUnpublishPostId = await insertTestPost({
    title: `Moderator unpublish test post ${suffix}`,
    slug: `mod-unpublish-post-${suffix}`,
    createdById: owner.id,
    markdown: 'Post for moderator unpublish test.',
    communityId,
  })
  await insertTestCommunityPostReview({
    communityId,
    postId: moderatorUnpublishPostId,
    submittedById: owner.id,
  })
})

test.describe('Community post unpublish', () => {
  test('owner sees unpublish button on a community post detail page', async ({ page }) => {
    await loginAsUser(page, ownerUserId)
    await navigateTo(page, `/discussion/${publishedPostId}`)

    // Open the overflow kebab to reveal the unpublish trigger
    await page.getByTestId('post-detail-overflow-trigger').click()

    await expect(page.getByTestId('post-unpublish-from-community-trigger')).toBeVisible()
  })

  test('owner can unpublish a post from the community', async ({ page }) => {
    await loginAsUser(page, ownerUserId)
    await navigateTo(page, `/discussion/${unpublishPostId}`)

    await waitForBelowFoldHydration(page)
    // Open the overflow kebab to reveal the unpublish trigger
    await page.getByTestId('post-detail-overflow-trigger').click()

    const triggerButton = page.getByTestId('post-unpublish-from-community-trigger')
    await expect(triggerButton).toBeVisible()

    await triggerButton.click()

    const dialog = page.getByTestId('post-unpublish-from-community-dialog')
    await expect(dialog).toBeVisible()

    const confirmButton = page.getByTestId('post-unpublish-from-community-confirm')
    await expect(confirmButton).toBeVisible()
    await confirmButton.click()

    await expect(page.getByTestId('post-unpublish-from-community-trigger')).not.toBeAttached()
  })

  test('moderator can unpublish a post from the community', async ({ page }) => {
    await loginAsUser(page, moderatorUserId)
    await navigateTo(page, `/discussion/${moderatorUnpublishPostId}`)

    await waitForBelowFoldHydration(page)
    await page.getByTestId('post-detail-overflow-trigger').click()

    const triggerButton = page.getByTestId('post-unpublish-from-community-trigger')
    await expect(triggerButton).toBeVisible()

    await triggerButton.click()

    const dialog = page.getByTestId('post-unpublish-from-community-dialog')
    await expect(dialog).toBeVisible()

    const confirmButton = page.getByTestId('post-unpublish-from-community-confirm')
    await expect(confirmButton).toBeVisible()
    await confirmButton.click()

    await expect(page.getByTestId('post-unpublish-from-community-trigger')).not.toBeAttached()
  })
})
