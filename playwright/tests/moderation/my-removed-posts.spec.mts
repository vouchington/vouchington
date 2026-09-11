import { test, expect } from '../../helpers/test.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { randomSuffix } from '../../helpers/random-id.mts'
import { requireTestValue } from '../../helpers/assertions.mts'
import { loginAsUser } from '../../helpers/auth.mts'
import {
  createTestUser,
  insertTestCommunity,
  insertTestCommunityMember,
  insertTestPost,
  insertTestCommunityPostReview,
  updateTestCommunityPostReviewState,
} from '../../../backend/test-helpers/index.mts'

let removedUserId = ''
let communitySlug = ''

test.beforeAll(async () => {
  const suffix = randomSuffix()

  const owner = requireTestValue(
    await createTestUser({ username: `removed-posts-owner-${suffix}` }),
    'Failed to create owner',
  )

  const removedUser = requireTestValue(
    await createTestUser({ username: `removed-posts-user-${suffix}` }),
    'Failed to create user',
  )
  removedUserId = removedUser.id

  communitySlug = `removed-posts-test-${suffix}`

  const community = await insertTestCommunity({
    createdById: owner.id,
    slug: communitySlug,
    name: `Removed Posts Test Community ${suffix}`,
    visibility: 'public',
  })

  await insertTestCommunityMember({ communityId: community.id, userId: owner.id, role: 'owner' })
  await insertTestCommunityMember({
    communityId: community.id,
    userId: removedUser.id,
    role: 'member',
  })

  const postId = await insertTestPost({
    title: `Removed post title ${suffix}`,
    slug: `removed-post-${suffix}`,
    createdById: removedUser.id,
    markdown: 'Test post content.',
    communityId: community.id,
  })

  await insertTestCommunityPostReview({
    communityId: community.id,
    postId,
    submittedById: removedUser.id,
  })

  await updateTestCommunityPostReviewState({
    communityId: community.id,
    postId,
    unpublishedAt: new Date(),
  })
})

test.describe('My Removed Posts — /my/removed-posts page', () => {
  test('shows removed posts list with title, date, community, and appeal button', async ({
    page,
  }) => {
    await loginAsUser(page, removedUserId)
    await navigateTo(page, '/my/removed-posts')

    await expect(page.getByTestId('my-removed-posts-page')).toBeVisible()
    await expect(page.getByTestId('my-removed-posts-list')).toBeVisible()

    const items = page.getByTestId('my-removed-post-item')
    await expect(items).not.toHaveCount(0)

    await expect(page.getByTestId('my-removed-post-title').first()).toBeVisible()
    await expect(page.getByTestId('my-removed-post-date').first()).toBeVisible()

    // Appeal dialog trigger should be present
    const appealTrigger = page.getByTestId('appeal-dialog-trigger').first()
    await expect(appealTrigger).toBeVisible()

    // Community link should render
    const communityLink = page.getByRole('link', { name: communitySlug })
    await expect(communityLink).toBeVisible()
  })

  test('shows empty state for a user with no removed posts', async ({ page }) => {
    const cleanUser = requireTestValue(await createTestUser(), 'Failed to create clean user')

    await loginAsUser(page, cleanUser.id)
    await navigateTo(page, '/my/removed-posts')

    await expect(page.getByTestId('my-removed-posts-empty')).toBeVisible()
  })

  test('does not show load-more button when user has only one removed post', async ({ page }) => {
    await loginAsUser(page, removedUserId)
    await navigateTo(page, '/my/removed-posts')

    await expect(page.getByTestId('my-removed-posts-list')).toBeVisible()
    await expect(page.getByTestId('my-removed-posts-load-more')).toBeHidden()
  })
})
