import { randomBytes } from 'node:crypto'
import { expect, test } from '../../helpers/test.mts'
import { loginAsUser } from '../../helpers/auth.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { randomSuffix } from '../../helpers/random-id.mts'
import { requireTestValue } from '../../helpers/assertions.mts'
import {
  createTestUser,
  getCommunityPostReviewAutomodState,
  insertTestCommunity,
  insertTestCommunityMember,
  insertTestCommunityPostReview,
  insertTestPost,
  setPostLLMModerationContentSha256,
  setTestCommunityPostReviewAutomodFlag,
} from '../../../backend/test-helpers/index.mts'

async function seedFlaggedCommunity(label: string): Promise<{
  ownerId: string
  slug: string
  postId: string
}> {
  const suffix = randomSuffix()
  const owner = requireTestValue(
    await createTestUser({ username: `automod-flags-${label}-${suffix}` }),
    'Failed to create owner user',
  )
  const slug = `automod-flags-${label}-${suffix}`
  const community = await insertTestCommunity({
    createdById: owner.id,
    slug,
    name: `Automod Flags ${label} ${suffix}`,
  })
  await insertTestCommunityMember({ communityId: community.id, userId: owner.id, role: 'owner' })

  const postId = await insertTestPost({
    title: `Automod flagged post ${suffix}`,
    slug: `automod-flagged-${label}-${suffix}`,
    createdById: owner.id,
    markdown: 'Post the community classifier flagged for moderator review.',
    communityId: community.id,
  })
  await insertTestCommunityPostReview({
    communityId: community.id,
    postId,
    submittedById: owner.id,
  })
  // The flag is open only for the content version it was raised on, so the post needs a digest.
  await setPostLLMModerationContentSha256(postId, randomBytes(32))
  return { ownerId: owner.id, slug, postId }
}

test.describe('Community automod flags panel', () => {
  test('owner sees an open review-queue flag and dismisses it', async ({ page }) => {
    const { ownerId, slug, postId } = await seedFlaggedCommunity('open')
    await setTestCommunityPostReviewAutomodFlag({ postId, action: 'review_queue' })

    await loginAsUser(page, ownerId)
    await navigateTo(page, `/communities/${slug}/settings/moderation`)

    await expect(page.getByTestId('community-moderation-heading')).toBeVisible()
    await expect(page.getByTestId('community-automod-flags-panel')).toBeVisible({
      timeout: 10_000,
    })
    await expect(page.getByTestId('community-automod-flag-row')).toHaveCount(1)

    const responsePromise = page.waitForResponse(
      r =>
        r.ok() &&
        r.url().includes(`/posts/${postId}/automod-flag/dismissal`) &&
        r.request().method() === 'POST',
    )
    await page.getByTestId('community-automod-flag-dismiss-button').click()
    await responsePromise

    await expect(page.getByTestId('community-automod-flags-panel')).not.toBeAttached({
      timeout: 10_000,
    })
    const state = await getCommunityPostReviewAutomodState(postId)
    expect(state?.automod_dismissed_by_id).toBe(ownerId)
  })

  test('moderation page shows no flags panel for an edited post or an unpublish flag', async ({
    page,
  }) => {
    const edited = await seedFlaggedCommunity('edited')
    await setTestCommunityPostReviewAutomodFlag({ postId: edited.postId, action: 'review_queue' })
    // A new content version supersedes the flag without any write to the review row.
    await setPostLLMModerationContentSha256(edited.postId, randomBytes(32))

    await loginAsUser(page, edited.ownerId)
    await navigateTo(page, `/communities/${edited.slug}/settings/moderation`)
    await expect(page.getByTestId('community-moderation-heading')).toBeVisible()
    await expect(page.getByTestId('community-automod-flags-panel')).not.toBeAttached()

    const unpublished = await seedFlaggedCommunity('unpublish')
    await setTestCommunityPostReviewAutomodFlag({ postId: unpublished.postId, action: 'unpublish' })

    await loginAsUser(page, unpublished.ownerId)
    await navigateTo(page, `/communities/${unpublished.slug}/settings/moderation`)
    await expect(page.getByTestId('community-moderation-heading')).toBeVisible()
    await expect(page.getByTestId('community-automod-flags-panel')).not.toBeAttached()
  })
})
