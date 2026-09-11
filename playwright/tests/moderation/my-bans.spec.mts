import { test, expect } from '../../helpers/test.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { randomSuffix } from '../../helpers/random-id.mts'
import { loginAsUser } from '../../helpers/auth.mts'
import { requireTestValue } from '../../helpers/assertions.mts'
import {
  createTestUser,
  insertTestCommunity,
  insertTestCommunityMember,
  insertTestCommunityBan,
} from '../../../backend/test-helpers/index.mts'

let bannedUserId = ''
let banReason = ''
let communitySlug = ''

test.beforeAll(async () => {
  const suffix = randomSuffix()

  const owner = requireTestValue(
    await createTestUser({ username: `bans-page-owner-${suffix}` }),
    'Failed to create owner',
  )

  const bannedUser = requireTestValue(
    await createTestUser({ username: `bans-page-banned-${suffix}` }),
    'Failed to create banned user',
  )
  bannedUserId = bannedUser.id

  communitySlug = `bans-page-test-${suffix}`
  banReason = `E2E ban reason ${suffix}`

  const community = await insertTestCommunity({
    createdById: owner.id,
    slug: communitySlug,
    name: `Bans Page Test Community ${suffix}`,
    visibility: 'public',
  })

  await insertTestCommunityMember({ communityId: community.id, userId: owner.id, role: 'owner' })
  await insertTestCommunityMember({
    communityId: community.id,
    userId: bannedUser.id,
    role: 'member',
  })

  await insertTestCommunityBan({
    communityId: community.id,
    userId: bannedUser.id,
    bannedById: owner.id,
    reason: banReason,
  })
})

test.describe('My Bans — /my/bans page', () => {
  test('shows bans list with date, reason, community, and appeal button', async ({ page }) => {
    await loginAsUser(page, bannedUserId)
    await navigateTo(page, '/my/bans')

    await expect(page.getByTestId('my-bans-page')).toBeVisible()
    await expect(page.getByTestId('my-bans-list')).toBeVisible()

    const items = page.getByTestId('my-ban-item')
    await expect(items).not.toHaveCount(0)

    await expect(page.getByTestId('my-ban-date').first()).toBeVisible()
    await expect(page.getByTestId('my-ban-reason').first()).toBeVisible()

    // The appeal dialog trigger should be present
    const appealTrigger = page.getByTestId('appeal-dialog-trigger').first()
    await expect(appealTrigger).toBeVisible()

    // Verify community link is rendered
    const communityLink = page.getByRole('link', { name: communitySlug })
    await expect(communityLink).toBeVisible()
  })

  test('shows empty state for a user with no bans', async ({ page }) => {
    const cleanUser = requireTestValue(await createTestUser(), 'Failed to create clean user')

    await loginAsUser(page, cleanUser.id)
    await navigateTo(page, '/my/bans')

    await expect(page.getByTestId('my-bans-empty')).toBeVisible()
  })

  test('shows expiry date when ban has an expires_at date', async ({ page }) => {
    const suffix = randomSuffix()
    const owner = requireTestValue(
      await createTestUser({ username: `bans-expires-owner-${suffix}` }),
      'Failed to create owner',
    )
    const user = requireTestValue(
      await createTestUser({ username: `bans-expires-user-${suffix}` }),
      'Failed to create user',
    )

    const community = await insertTestCommunity({
      createdById: owner.id,
      slug: `bans-expires-${suffix}`,
      name: `Expires Ban Test ${suffix}`,
      visibility: 'public',
    })
    await insertTestCommunityMember({ communityId: community.id, userId: owner.id, role: 'owner' })
    await insertTestCommunityMember({ communityId: community.id, userId: user.id, role: 'member' })
    await insertTestCommunityBan({
      communityId: community.id,
      userId: user.id,
      bannedById: owner.id,
      reason: 'Temporary ban',
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
    })

    await loginAsUser(page, user.id)
    await navigateTo(page, '/my/bans')

    await expect(page.getByTestId('my-ban-expires').first()).toBeVisible()
  })

  test('shows "no reason" placeholder when ban has no reason', async ({ page }) => {
    const suffix = randomSuffix()
    const owner = requireTestValue(
      await createTestUser({ username: `bans-noreason-owner-${suffix}` }),
      'Failed to create owner',
    )
    const user = requireTestValue(
      await createTestUser({ username: `bans-noreason-user-${suffix}` }),
      'Failed to create user',
    )

    const community = await insertTestCommunity({
      createdById: owner.id,
      slug: `bans-noreason-${suffix}`,
      name: `No Reason Ban Test ${suffix}`,
      visibility: 'public',
    })
    await insertTestCommunityMember({ communityId: community.id, userId: owner.id, role: 'owner' })
    await insertTestCommunityMember({ communityId: community.id, userId: user.id, role: 'member' })
    await insertTestCommunityBan({
      communityId: community.id,
      userId: user.id,
      bannedById: owner.id,
      reason: null,
    })

    await loginAsUser(page, user.id)
    await navigateTo(page, '/my/bans')

    await expect(page.getByTestId('my-ban-no-reason').first()).toBeVisible()
  })

  test('does not show load-more button when user has only one ban', async ({ page }) => {
    await loginAsUser(page, bannedUserId)
    await navigateTo(page, '/my/bans')

    await expect(page.getByTestId('my-bans-list')).toBeVisible()
    await expect(page.getByTestId('my-bans-load-more')).toBeHidden()
  })
})
