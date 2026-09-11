import { test, expect } from '../../helpers/test.mts'
import { loginAsUser } from '../../helpers/auth.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { randomSuffix } from '../../helpers/random-id.mts'
import { requireTestValue } from '../../helpers/assertions.mts'
import {
  createTestUser,
  insertTestCommunity,
  insertTestCommunityMember,
  insertTestModeratorAction,
} from '../../../backend/test-helpers/index.mts'

let ownerUserId = ''
let communitySlug = ''
let communityId = ''
let emptyOwnerUserId = ''
let emptyCommunitySlug = ''

test.beforeAll(async () => {
  const suffix = randomSuffix()

  const owner = requireTestValue(
    await createTestUser({ username: `modlog-owner-${suffix}` }),
    'Failed to create owner',
  )
  ownerUserId = owner.id

  const target = requireTestValue(
    await createTestUser({ username: `modlog-target-${suffix}` }),
    'Failed to create target',
  )

  communitySlug = `modlog-test-${suffix}`
  const community = await insertTestCommunity({
    createdById: owner.id,
    slug: communitySlug,
    name: `Modlog Test Community ${suffix}`,
    visibility: 'public',
  })
  communityId = community.id

  await insertTestCommunityMember({ communityId, userId: owner.id, role: 'owner' })
  await insertTestCommunityMember({ communityId, userId: target.id, role: 'member' })

  // Pre-seed a moderator_actions row so the modlog will have an entry
  await insertTestModeratorAction({
    actorId: owner.id,
    actionType: 'ban',
    communityId,
    targetUserId: target.id,
    reason: 'Pre-seeded ban for modlog test',
  })

  // Empty community for empty-state test
  const emptyOwner = requireTestValue(
    await createTestUser({ username: `modlog-empty-owner-${suffix}` }),
    'Failed to create empty owner',
  )
  emptyOwnerUserId = emptyOwner.id
  emptyCommunitySlug = `modlog-empty-${suffix}`
  const emptyCommunity = await insertTestCommunity({
    createdById: emptyOwner.id,
    slug: emptyCommunitySlug,
    name: `Modlog Empty Community ${suffix}`,
    visibility: 'public',
  })
  await insertTestCommunityMember({
    communityId: emptyCommunity.id,
    userId: emptyOwner.id,
    role: 'owner',
  })
})

test.describe('community modlog', () => {
  test('owner sees modlog heading', async ({ page }) => {
    await loginAsUser(page, ownerUserId)
    await navigateTo(page, `/communities/${communitySlug}/settings/modlog`)

    await expect(page.getByTestId('community-modlog-heading')).toBeVisible()
  })

  test('modlog shows a row when actions exist', async ({ page }) => {
    await loginAsUser(page, ownerUserId)
    await navigateTo(page, `/communities/${communitySlug}/settings/modlog`)

    await expect(page.getByTestId('community-modlog-heading')).toBeVisible()
    await expect(page.getByTestId('community-modlog-row').first()).toBeVisible()
  })

  test('modlog shows empty state when no actions exist', async ({ page }) => {
    await loginAsUser(page, emptyOwnerUserId)
    await navigateTo(page, `/communities/${emptyCommunitySlug}/settings/modlog`)

    await expect(page.getByTestId('community-modlog-heading')).toBeVisible()
    await expect(page.getByTestId('community-modlog-empty')).toBeVisible()
  })

  test('non-member cannot access modlog page', async ({ page }) => {
    const nonMember = requireTestValue(await createTestUser(), 'Failed to create non-member')
    await loginAsUser(page, nonMember.id)
    await navigateTo(page, `/communities/${communitySlug}/settings/modlog`)

    // Non-members see a 404 page — modlog heading must not be visible
    await expect(page.getByTestId('community-modlog-heading')).toBeHidden()
  })
})
