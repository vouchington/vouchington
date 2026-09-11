import { test, expect } from '../../helpers/test.mts'
import { loginAsUser } from '../../helpers/auth.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { randomSuffix } from '../../helpers/random-id.mts'
import { AUTH_STATE } from '../../helpers/auth-state.mts'
import {
  createTestUser,
  insertTestCommunity,
  insertTestCommunityMember,
} from '../../../backend/test-helpers/index.mts'

test.describe('Moderation Analytics — site (SA)', () => {
  test.use({ storageState: AUTH_STATE })

  test('admin can view the site moderation analytics dashboard', async ({ page }) => {
    await navigateTo(page, '/admin/moderation-analytics')

    await expect(page.getByTestId('moderation-analytics-dashboard')).toBeVisible()
    await expect(page.getByTestId('moderation-analytics-range')).toBeVisible()
    await expect(page.getByTestId('moderation-analytics-card-reports')).toBeVisible()
    await expect(page.getByTestId('moderation-analytics-card-automod-actions')).toBeVisible()
    await expect(page.getByTestId('moderation-analytics-card-appeal-success')).toBeVisible()
    await expect(page.getByTestId('moderation-analytics-card-new-user-rejections')).toBeVisible()
    await expect(page.getByTestId('moderation-analytics-chart-queue-volume')).toBeVisible()
    await expect(page.getByTestId('moderation-analytics-chart-automod-performance')).toBeVisible()
    await expect(page.getByTestId('moderation-analytics-ministat-reviewed')).toBeVisible()
    await expect(
      page.getByTestId('moderation-analytics-ministat-false-positive-rate'),
    ).toBeVisible()
    await expect(page.getByTestId('moderation-analytics-list-rule-violations')).toBeVisible()
    await expect(page.getByTestId('moderation-analytics-list-automod-sources')).toBeVisible()
    await expect(page.getByTestId('moderation-analytics-list-confidence')).toBeVisible()
    await expect(page.getByTestId('moderation-analytics-workload')).toBeVisible()
  })
})

test.describe('Moderation Analytics — community (CO/CM)', () => {
  let ownerUserId = ''
  let moderatorUserId = ''
  let communitySlug = ''

  test.beforeAll(async () => {
    const suffix = randomSuffix()

    const owner = await createTestUser({ username: `analytics-owner-${suffix}` })
    if (!owner) throw new Error('Failed to create owner')
    ownerUserId = owner.id

    const moderator = await createTestUser({ username: `analytics-mod-${suffix}` })
    if (!moderator) throw new Error('Failed to create moderator')
    moderatorUserId = moderator.id

    communitySlug = `analytics-community-${suffix}`
    const community = await insertTestCommunity({
      createdById: owner.id,
      visibility: 'public',
      slug: communitySlug,
    })
    await insertTestCommunityMember({ communityId: community.id, userId: owner.id, role: 'owner' })
    await insertTestCommunityMember({
      communityId: community.id,
      userId: moderator.id,
      role: 'moderator',
    })
  })

  test('community owner can view the community moderation analytics dashboard', async ({
    page,
  }) => {
    await loginAsUser(page, ownerUserId)
    await navigateTo(page, `/communities/${communitySlug}/settings/moderation/analytics`)

    await expect(page.getByTestId('moderation-analytics-dashboard')).toBeVisible()
  })

  test('community moderator can view the community moderation analytics dashboard', async ({
    page,
  }) => {
    await loginAsUser(page, moderatorUserId)
    await navigateTo(page, `/communities/${communitySlug}/settings/moderation/analytics`)

    await expect(page.getByTestId('moderation-analytics-dashboard')).toBeVisible()
  })
})
