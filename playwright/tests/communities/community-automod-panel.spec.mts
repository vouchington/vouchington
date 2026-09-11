import { expect, test } from '../../helpers/test.mts'
import { loginAsUser } from '../../helpers/auth.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { randomSuffix } from '../../helpers/random-id.mts'
import { requireTestValue } from '../../helpers/assertions.mts'
import {
  createTestUser,
  insertTestAgentModeration,
  insertTestCommunity,
  insertTestCommunityAgentPrompt,
  insertTestCommunityMember,
  insertTestCommunityPostReview,
  insertTestPost,
  updateTestCommunityPostReviewState,
} from '../../../backend/test-helpers/index.mts'

let ownerUserId = ''
let communitySlug = ''
let emptyCommunitySlug = ''

test.beforeAll(async () => {
  const suffix = randomSuffix()

  const owner = requireTestValue(
    await createTestUser({ username: `automod-panel-owner-${suffix}` }),
    'Failed to create owner user',
  )
  ownerUserId = owner.id

  // Community with automod actions seeded
  communitySlug = `automod-panel-${suffix}`
  const community = await insertTestCommunity({
    createdById: owner.id,
    slug: communitySlug,
    name: `Automod Panel Test ${suffix}`,
  })
  await insertTestCommunityMember({ communityId: community.id, userId: owner.id, role: 'owner' })

  // Seed an agent prompt so the panel has an action to display
  const agentPrompt = await insertTestCommunityAgentPrompt({
    communityId: community.id,
    createdById: owner.id,
    slotAllocated: true,
    onFlagAction: 'unpublish',
  })

  const postId = await insertTestPost({
    title: `Automod flagged post ${suffix}`,
    slug: `automod-flagged-${suffix}`,
    createdById: owner.id,
    markdown: 'Post flagged by automod for review panel test.',
    communityId: community.id,
  })
  // The community_prompt source type requires a community_post_reviews row with
  // unpublished_at set and unpublished_by_id = NULL (automod-driven unpublish).
  await insertTestCommunityPostReview({
    communityId: community.id,
    postId,
    submittedById: owner.id,
  })
  await updateTestCommunityPostReviewState({
    communityId: community.id,
    postId,
    unpublishedAt: new Date(),
  })
  await insertTestAgentModeration({
    postId,
    agentId: agentPrompt.agent_id,
    promptId: agentPrompt.id,
    flagged: true,
    results: {
      flagged: true,
      reason: 'Low quality',
      confidence_score: 0.35,
    },
  })

  // Empty community for structural-absence test
  emptyCommunitySlug = `automod-panel-empty-${suffix}`
  const emptyCommunity = await insertTestCommunity({
    createdById: owner.id,
    slug: emptyCommunitySlug,
    name: `Automod Panel Empty ${suffix}`,
  })
  await insertTestCommunityMember({
    communityId: emptyCommunity.id,
    userId: owner.id,
    role: 'owner',
  })
})

test.describe('Community automod review panel', () => {
  test('owner sees the automod review panel with flagged post actions', async ({ page }) => {
    await loginAsUser(page, ownerUserId)
    await navigateTo(page, `/communities/${communitySlug}/settings/moderation`)

    await expect(page.getByTestId('community-moderation-heading')).toBeVisible()
    await expect(page.getByTestId('community-automod-review-panel')).toBeVisible({
      timeout: 10_000,
    })
    await expect(page.getByTestId('automod-approve-button').first()).toBeVisible()
    await expect(page.getByTestId('automod-reject-button').first()).toBeVisible()
  })

  test('owner can keep-removed a flagged post from the automod panel', async ({ page }) => {
    const suffix = randomSuffix()
    const owner = requireTestValue(
      await createTestUser({ username: `automod-action-owner-${suffix}` }),
      'Failed to create owner user',
    )

    const slug = `automod-action-${suffix}`
    const community = await insertTestCommunity({
      createdById: owner.id,
      slug,
      name: `Automod Action Test ${suffix}`,
    })
    await insertTestCommunityMember({ communityId: community.id, userId: owner.id, role: 'owner' })

    const agentPrompt = await insertTestCommunityAgentPrompt({
      communityId: community.id,
      createdById: owner.id,
      slotAllocated: true,
      onFlagAction: 'unpublish',
    })

    const postId = await insertTestPost({
      title: `Automod action post ${suffix}`,
      slug: `automod-action-post-${suffix}`,
      createdById: owner.id,
      markdown: 'Post to keep removed via automod review panel.',
      communityId: community.id,
    })
    // The community_prompt source type requires a community_post_reviews row with
    // unpublished_at set and unpublished_by_id = NULL (automod-driven unpublish).
    await insertTestCommunityPostReview({
      communityId: community.id,
      postId,
      submittedById: owner.id,
    })
    await updateTestCommunityPostReviewState({
      communityId: community.id,
      postId,
      unpublishedAt: new Date(),
    })
    await insertTestAgentModeration({
      postId,
      agentId: agentPrompt.agent_id,
      promptId: agentPrompt.id,
      flagged: true,
      results: {
        flagged: true,
        reason: 'Possible spam',
        confidence_score: 0.3,
      },
    })

    await loginAsUser(page, owner.id)
    await navigateTo(page, `/communities/${slug}/settings/moderation`)

    await expect(page.getByTestId('community-automod-review-panel')).toBeVisible({
      timeout: 10_000,
    })

    const rejectButton = page.getByTestId('automod-reject-button').first()
    await expect(rejectButton).toBeVisible()

    const responsePromise = page.waitForResponse(
      r =>
        r.ok() &&
        r.url().includes('/automod/recent-actions/') &&
        r.url().includes('/feedback') &&
        r.request().method() === 'POST',
    )
    await rejectButton.click()
    await responsePromise

    // After labelling, the panel removes the completed item. The POST response
    // triggers a router.refresh() RSC round-trip; give the assertion extra time.
    await expect(page.getByTestId('community-automod-review-panel')).not.toBeAttached({
      timeout: 10_000,
    })
  })

  test('moderation page loads without automod panel when no flagged actions exist', async ({
    page,
  }) => {
    await loginAsUser(page, ownerUserId)
    await navigateTo(page, `/communities/${emptyCommunitySlug}/settings/moderation`)

    await expect(page.getByTestId('community-moderation-heading')).toBeVisible()
    await expect(page.getByTestId('community-automod-review-panel')).not.toBeAttached()
  })
})
