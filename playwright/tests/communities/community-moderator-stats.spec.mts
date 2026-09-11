import { test, expect } from '../../helpers/test.mts'
import { loginAsUser } from '../../helpers/auth.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { randomSuffix } from '../../helpers/random-id.mts'
import { removeLocalStorageKeysBeforeNavigation } from '../../helpers/browser-state.mts'
import {
  createTestUser,
  insertTestCommunity,
  insertTestCommunityMember,
  insertTestModeratorAction,
} from '../../../backend/test-helpers/index.mts'

// Community with seeded mod actions: stats table visible
let ownerUserId = ''
let communitySlug = ''
let communityId = ''

// Community with no mod actions: empty state in stats panel
// Also used for onboarding checklist tests (no rules, no automod)
let emptyOwnerUserId = ''
let emptyCommunitySlug = ''

test.beforeAll(async () => {
  const suffix = randomSuffix()

  const owner = await createTestUser({ username: `modstats-owner-${suffix}` })
  if (!owner) throw new Error('Failed to create owner')
  ownerUserId = owner.id

  communitySlug = `modstats-test-${suffix}`
  const community = await insertTestCommunity({
    createdById: owner.id,
    slug: communitySlug,
    name: `Mod Stats Test ${suffix}`,
    visibility: 'public',
  })
  communityId = community.id
  await insertTestCommunityMember({ communityId, userId: owner.id, role: 'owner' })
  await insertTestModeratorAction({ actorId: owner.id, actionType: 'remove', communityId })

  // Empty community for stats empty-state and onboarding tests
  const emptyOwner = await createTestUser({ username: `modstats-empty-${suffix}` })
  if (!emptyOwner) throw new Error('Failed to create empty owner')
  emptyOwnerUserId = emptyOwner.id
  emptyCommunitySlug = `modstats-empty-${suffix}`
  const emptyCommunity = await insertTestCommunity({
    createdById: emptyOwner.id,
    slug: emptyCommunitySlug,
    name: `Mod Stats Empty ${suffix}`,
    visibility: 'public',
  })
  await insertTestCommunityMember({
    communityId: emptyCommunity.id,
    userId: emptyOwner.id,
    role: 'owner',
  })
})

test.describe('community moderator stats panel', () => {
  test('shows heading and stats table when actions exist', async ({ page }) => {
    await loginAsUser(page, ownerUserId)
    await navigateTo(page, `/communities/${communitySlug}/settings/moderation`)

    await expect(page.getByTestId('community-moderator-stats-heading')).toBeVisible()
    await expect(page.getByTestId('moderator-stats-table')).toBeVisible()
    await expect(page.getByTestId('moderator-stats-row').first()).toBeVisible()
  })

  test('shows empty state when no actions exist', async ({ page }) => {
    await loginAsUser(page, emptyOwnerUserId)
    await navigateTo(page, `/communities/${emptyCommunitySlug}/settings/moderation`)

    await expect(page.getByTestId('community-moderator-stats-heading')).toBeVisible()
    await expect(page.getByTestId('moderator-stats-empty')).toBeVisible()
  })

  test('30-day and 90-day window toggle buttons are visible', async ({ page }) => {
    await loginAsUser(page, ownerUserId)
    await navigateTo(page, `/communities/${communitySlug}/settings/moderation`)

    await expect(page.getByTestId('moderator-stats-window-30')).toBeVisible()
    await expect(page.getByTestId('moderator-stats-window-90')).toBeVisible()
  })
})

test.describe('community moderator onboarding checklist', () => {
  test('shows all checklist items and dismiss button on fresh community', async ({ page }) => {
    await removeLocalStorageKeysBeforeNavigation(page, [
      `community-mod-onboarding:${emptyCommunitySlug}`,
    ])
    await loginAsUser(page, emptyOwnerUserId)
    await navigateTo(page, `/communities/${emptyCommunitySlug}/settings/moderation`)

    await expect(page.getByTestId('community-onboarding-checklist')).toBeVisible()
    await expect(page.getByTestId('community-onboarding-dismiss')).toBeVisible()
    await expect(page.getByTestId('onboarding-item-rules')).toBeVisible()
    await expect(page.getByTestId('onboarding-item-automod')).toBeVisible()
    await expect(page.getByTestId('onboarding-item-orientation')).toBeVisible()
  })

  test('orientation ack button hides after clicking', async ({ page }) => {
    await removeLocalStorageKeysBeforeNavigation(page, [
      `community-mod-onboarding:${emptyCommunitySlug}`,
    ])
    await loginAsUser(page, emptyOwnerUserId)
    await navigateTo(page, `/communities/${emptyCommunitySlug}/settings/moderation`)

    const ackButton = page.getByTestId('onboarding-item-orientation-ack')
    await expect(ackButton).toBeVisible()
    await ackButton.click()
    await expect(ackButton).toBeHidden()
  })

  test('dismiss button hides the checklist', async ({ page }) => {
    await removeLocalStorageKeysBeforeNavigation(page, [
      `community-mod-onboarding:${emptyCommunitySlug}`,
    ])
    await loginAsUser(page, emptyOwnerUserId)
    await navigateTo(page, `/communities/${emptyCommunitySlug}/settings/moderation`)

    await expect(page.getByTestId('community-onboarding-checklist')).toBeVisible()
    await page.getByTestId('community-onboarding-dismiss').click()
    await expect(page.getByTestId('community-onboarding-checklist')).toBeHidden()
  })
})
