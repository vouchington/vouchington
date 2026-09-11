import { test, expect } from '../../helpers/test.mts'
import { loginAsUser } from '../../helpers/auth.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { randomSuffix } from '../../helpers/random-id.mts'
import {
  createTestUser,
  insertTestCommunity,
  insertTestCommunityMember,
  insertTestCommunityBan,
} from '../../../backend/test-helpers/index.mts'

let ownerUserId = ''
let communitySlug = ''
let communityId = ''
// empty-bans community for the no-bans state test
let emptyBansOwnerUserId = ''
let emptyBansCommunitySlug = ''

test.beforeAll(async () => {
  const suffix = randomSuffix()

  const owner = await createTestUser({ username: `ban-owner-${suffix}` })
  if (!owner) throw new Error('Failed to create owner')
  ownerUserId = owner.id

  const member = await createTestUser({ username: `ban-member-${suffix}` })
  if (!member) throw new Error('Failed to create member')

  communitySlug = `ban-test-${suffix}`
  const community = await insertTestCommunity({
    createdById: owner.id,
    slug: communitySlug,
    name: `Ban Test Community ${suffix}`,
    visibility: 'public',
  })
  communityId = community.id

  await insertTestCommunityMember({ communityId, userId: owner.id, role: 'owner' })
  await insertTestCommunityMember({ communityId, userId: member.id, role: 'member' })

  // Pre-seed a banned user so the ban history panel has content before any test runs
  const preBanned = await createTestUser({ username: `pre-banned-${suffix}` })
  if (!preBanned) throw new Error('Failed to create pre-banned user')
  await insertTestCommunityBan({
    communityId,
    userId: preBanned.id,
    bannedById: owner.id,
    reason: 'Pre-seeded ban for history panel test',
  })

  // Empty-bans community: owner with no bans for the empty-state test
  const emptyOwner = await createTestUser({ username: `empty-bans-owner-${suffix}` })
  if (!emptyOwner) throw new Error('Failed to create empty-bans owner')
  emptyBansOwnerUserId = emptyOwner.id
  emptyBansCommunitySlug = `ban-empty-${suffix}`
  const emptyCommunity = await insertTestCommunity({
    createdById: emptyOwner.id,
    slug: emptyBansCommunitySlug,
    name: `Empty Bans Community ${suffix}`,
    visibility: 'public',
  })
  await insertTestCommunityMember({
    communityId: emptyCommunity.id,
    userId: emptyOwner.id,
    role: 'owner',
  })
})

test.describe('community ban: member list', () => {
  test('owner sees Ban button on member row', async ({ page }) => {
    await loginAsUser(page, ownerUserId)
    await navigateTo(page, `/communities/${communitySlug}/members`)

    await expect(page.getByTestId('community-ban-button').first()).toBeVisible()
  })

  test('owner bans a member via dialog with duration select', async ({ page }) => {
    await loginAsUser(page, ownerUserId)
    await navigateTo(page, `/communities/${communitySlug}/members`)

    const banButton = page.getByTestId('community-ban-button').first()
    await banButton.click()

    await expect(page.getByTestId('community-ban-reason')).toBeVisible()
    await page.getByTestId('community-ban-reason').pressSequentially('Test ban reason')

    // Exercise the duration select
    await page.getByTestId('community-ban-duration').click()
    await page.getByRole('listbox').getByRole('option', { name: '7 days' }).click()

    const banResponse = page.waitForResponse(
      resp => resp.url().includes('/bans') && resp.request().method() === 'POST',
    )
    await page.getByTestId('community-ban-confirm').click()
    await banResponse

    // The banned member is removed from the roster, leaving only the owner — who has no
    // ban button (you cannot ban yourself or an owner), so no ban buttons remain.
    await expect(page.getByTestId('community-ban-button')).toHaveCount(0)
  })
})

test.describe('community ban: moderation page ban history', () => {
  test('moderation page shows ban history panel with pre-seeded ban', async ({ page }) => {
    await loginAsUser(page, ownerUserId)
    await navigateTo(page, `/communities/${communitySlug}/settings/moderation`)

    await expect(page.getByTestId('community-bans-heading')).toBeVisible()
    await expect(page.getByTestId('community-ban-row').first()).toBeVisible()
  })

  test('moderation page shows empty state when no bans exist', async ({ page }) => {
    await loginAsUser(page, emptyBansOwnerUserId)
    await navigateTo(page, `/communities/${emptyBansCommunitySlug}/settings/moderation`)

    await expect(page.getByTestId('community-bans-heading')).toBeVisible()
    await expect(page.getByTestId('community-bans-empty')).toBeVisible()
  })

  test('owner can lift a ban from ban history', async ({ page }) => {
    await loginAsUser(page, ownerUserId)
    await navigateTo(page, `/communities/${communitySlug}/settings/moderation`)

    await expect(page.getByTestId('community-ban-lift').first()).toBeVisible()

    const liftDone = page.waitForResponse(
      resp => resp.url().includes('/bans/') && resp.request().method() === 'DELETE',
    )
    await page.getByTestId('community-ban-lift').first().click()
    await liftDone
  })
})
