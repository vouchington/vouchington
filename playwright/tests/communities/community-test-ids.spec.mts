import { expect, test, protectPlaywrightHookTimeouts } from '../../helpers/test.mts'
import { loginAsUser, withCleanUser } from '../../helpers/auth.mts'
import { navigateTo, randomSuffix, requireTestValue } from 'vouchington-tooling/playwright'
import {
  createTestUser,
  insertTestCommunity,
  insertTestCommunityApplication,
  insertTestCommunityInvite,
  insertTestCommunityMember,
} from '../../../backend/test-helpers/index.mts'
import { insertQuestion } from '../../../backend/test-helpers/data-stores/psql/community-application-answer-schema.mts'

let ownerId = ''
let applicantId = ''
let publicSlug = ''
let privateSlug = ''
let questionsSlug = ''
let moderatorId = ''
let memberId = ''
let inviteCode = ''

test.beforeAll(async () => {
  protectPlaywrightHookTimeouts(test.info())
  const suffix = randomSuffix()
  const owner = requireTestValue(
    await createTestUser({ username: `community-ids-owner-${suffix}` }),
    'Failed to create community owner',
  )
  const applicant = requireTestValue(
    await createTestUser({ username: `community-ids-applicant-${suffix}` }),
    'Failed to create community applicant',
  )
  const moderator = requireTestValue(
    await createTestUser({ username: `community-ids-moderator-${suffix}` }),
    'Failed to create community moderator',
  )
  const member = requireTestValue(
    await createTestUser({ username: `community-ids-member-${suffix}` }),
    'Failed to create community member',
  )
  ownerId = owner.id
  applicantId = applicant.id
  moderatorId = moderator.id
  memberId = member.id

  publicSlug = `community-ids-public-${suffix}`
  const publicCommunity = await insertTestCommunity({
    createdById: ownerId,
    slug: publicSlug,
    name: `Community IDs Public ${suffix}`,
    should_allow_review_posts: true,
    should_allow_data_point_posts: true,
  })
  await insertTestCommunityMember({
    communityId: publicCommunity.id,
    userId: ownerId,
    role: 'owner',
  })
  await insertTestCommunityMember({
    communityId: publicCommunity.id,
    userId: moderatorId,
    role: 'moderator',
  })
  await insertTestCommunityMember({
    communityId: publicCommunity.id,
    userId: memberId,
    role: 'member',
  })

  privateSlug = `community-ids-private-${suffix}`
  const privateCommunity = await insertTestCommunity({
    createdById: ownerId,
    slug: privateSlug,
    name: `Community IDs Private ${suffix}`,
    visibility: 'private',
  })
  await insertTestCommunityMember({
    communityId: privateCommunity.id,
    userId: ownerId,
    role: 'owner',
  })
  await insertTestCommunityApplication({ communityId: privateCommunity.id, userId: applicantId })

  questionsSlug = `community-ids-questions-${suffix}`
  const questionsCommunity = await insertTestCommunity({
    createdById: ownerId,
    slug: questionsSlug,
    name: `Community IDs Questions ${suffix}`,
    visibility: 'private',
  })
  await insertTestCommunityMember({
    communityId: questionsCommunity.id,
    userId: ownerId,
    role: 'owner',
  })
  await insertQuestion(questionsCommunity.id)

  const invite = await insertTestCommunityInvite({
    communityId: publicCommunity.id,
    invitedById: ownerId,
    invitedUserId: applicantId,
  })
  inviteCode = invite.code
})

test.describe('Community interactive controls', () => {
  test('owner sees contribution, membership, and browse controls', async ({ page }) => {
    await loginAsUser(page, ownerId)
    await navigateTo(page, '/communities')
    await expect(page.getByTestId('communities-create-cta')).toBeVisible()
    await navigateTo(page, `/communities/${publicSlug}`)
    await expect(page.getByTestId('community-feed-start-discussion')).toBeVisible()
    await expect(page.getByTestId('community-feed-write-review')).toBeVisible()
    await expect(page.getByTestId('community-feed-share-data-point')).toBeVisible()
    await expect(page.getByTestId('join-button-leave')).toBeVisible()
  })

  test('private application shows the form for each question state', async ({ page }) => {
    // Staff can view a private community before joining it.
    await withCleanUser(page, { administrator: true })
    await navigateTo(page, `/communities/${privateSlug}`)
    await expect(page.getByTestId('join-button-apply-to-join')).toBeVisible()
    await navigateTo(page, `/communities/${privateSlug}/apply`)
    await expect(page.getByTestId('application-form-apply-to-join')).toBeVisible()
    await navigateTo(page, `/communities/${questionsSlug}/apply`)
    await expect(page.getByTestId('application-form-submit-application')).toBeVisible()
  })

  test('owner can open rejection and ownership confirmation controls', async ({ page }) => {
    await loginAsUser(page, ownerId)
    await navigateTo(page, `/communities/${privateSlug}/settings/applications`)
    await expect(page.getByTestId('application-review-approve')).toBeVisible()
    await expect(page.getByTestId('application-review-reject')).toBeVisible()
    await page.getByTestId('application-review-reject').click()
    await expect(page.getByTestId('application-review-confirm-reject')).toBeVisible()
    await expect(page.getByTestId('application-review-cancel')).toBeVisible()

    await navigateTo(page, `/communities/${publicSlug}/members`)
    await expect(page.getByTestId('community-member-row-make-moderator')).toBeVisible()
    await expect(page.getByTestId('community-member-row-remove-moderator')).toBeVisible()
    await expect(page.getByTestId('community-member-row-remove').first()).toBeVisible()
    const transferOwnership = page.getByTestId(
      'community-transfer-ownership-dialog-transfer-ownership',
    )
    const moderatorRow = page.locator('[data-community-member-id]').filter({
      has: transferOwnership,
    })
    await expect
      .poll(() => moderatorRow.evaluate(row => row.scrollWidth <= row.clientWidth))
      .toBe(true)
    await transferOwnership.click()
    await expect(
      page.getByTestId('community-transfer-ownership-dialog-confirm-transfer'),
    ).toBeVisible()
  })

  test('owner sees invite controls and recipient sees redemption', async ({ page }) => {
    await loginAsUser(page, ownerId)
    await navigateTo(page, `/communities/${publicSlug}/settings/invites`)
    await expect(page.getByTestId('invite-item-revoke')).toBeVisible()
    await page
      .getByTestId('community-invites-email-input')
      .pressSequentially(`tests+${randomSuffix()}@voucha.ai`)
    await page.getByTestId('community-invites-send-button').click()
    await expect(page.getByTestId('invite-code-notice-dismiss')).toBeVisible()

    await loginAsUser(page, applicantId)
    await navigateTo(page, `/communities/invite/${inviteCode}`)
    await expect(page.getByTestId('invite-redemption-redeem')).toBeVisible()
  })
})
