import { test, expect, withMonitoredPage } from '../../helpers/test.mts'
import { loginAsUser } from '../../helpers/auth.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { randomSuffix } from '../../helpers/random-id.mts'
import { requireTestValue } from '../../helpers/assertions.mts'
import {
  createTestUser,
  insertTestCommunity,
  insertTestCommunityMember,
  insertTestCommunityApplication,
} from '../../../backend/test-helpers/index.mts'

/**
 * Tests for the pending application state UI:
 * - join-button-application-pending
 * - apply-page-pending-button
 * - community-card-joined-badge (member card on community list)
 */

let communitySlug = ''
let communityId = ''
let applicantUserId = ''

test.beforeAll(async () => {
  const suffix = randomSuffix()
  communitySlug = `pw-apply-pending-${suffix}`

  const owner = requireTestValue(
    await createTestUser({ username: `apply-owner-${suffix}` }),
    'Failed to create owner',
  )

  const community = await insertTestCommunity({
    createdById: owner.id,
    slug: communitySlug,
    name: `PW Apply Pending ${suffix}`,
    visibility: 'private',
  })
  communityId = community.id
  await insertTestCommunityMember({ communityId, userId: owner.id, role: 'owner' })

  const applicant = requireTestValue(
    await createTestUser({ username: `apply-applicant-${suffix}` }),
    'Failed to create applicant',
  )
  applicantUserId = applicant.id

  await insertTestCommunityApplication({ communityId, userId: applicantUserId })
})

test.describe('Application Pending State', () => {
  test('shows disabled Application Pending button on community detail page after applying', async ({
    page,
  }) => {
    await loginAsUser(page, applicantUserId)
    await navigateTo(page, `/communities/${communitySlug}`)
    await expect(page.getByTestId('join-button-application-pending')).toBeVisible()
    await expect(page.getByTestId('join-button-application-pending')).toBeDisabled()
    await expect(page.getByTestId('community-feed-application-pending')).toBeVisible()
  })

  test('apply page shows pending state after application is submitted', async ({ page }) => {
    await loginAsUser(page, applicantUserId)
    await navigateTo(page, `/communities/${communitySlug}/apply`)
    await expect(page.getByTestId('apply-page-pending-button')).toBeVisible()
    await expect(page.getByTestId('apply-page-pending-button')).toBeDisabled()
  })
})

test.describe('Community Card Joined Badge', () => {
  test('shows Joined badge on community card when user is a member', async ({
    browser,
  }, testInfo) => {
    const suffix = randomSuffix()
    const slug = `pw-joined-badge-${suffix}`

    const owner = requireTestValue(
      await createTestUser({ username: `joined-owner-${suffix}` }),
      'Failed to create owner',
    )
    const member = requireTestValue(
      await createTestUser({ username: `joined-member-${suffix}` }),
      'Failed to create member',
    )

    const community = await insertTestCommunity({
      createdById: owner.id,
      slug,
      name: `PW Joined Badge ${suffix}`,
      visibility: 'public',
    })
    await insertTestCommunityMember({ communityId: community.id, userId: owner.id, role: 'owner' })
    await insertTestCommunityMember({
      communityId: community.id,
      userId: member.id,
      role: 'member',
    })

    await withMonitoredPage(browser, testInfo, async page => {
      await loginAsUser(page, member.id)
      await navigateTo(page, `/communities?q=${encodeURIComponent(`PW Joined Badge ${suffix}`)}`)
      await expect(page.getByTestId('community-card-joined-badge').first()).toBeVisible()
    })
  })
})
