import { test, expect } from '../../helpers/test.mts'
import { loginAsUser } from '../../helpers/auth.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { randomSuffix } from '../../helpers/random-id.mts'
import { waitForBelowFoldHydration } from '../../helpers/wait-for-hydration.mts'
import {
  createTestUser,
  insertTestCommunity,
  insertTestCommunityMember,
  insertTestModerationReport,
  insertTestPost,
  insertTestPendingCommunityPostReview,
  setTestBanEvasionFlag,
  insertTestSystemModerationReport,
} from '../../../backend/test-helpers/index.mts'
import { openRadixDropdown } from '../../helpers/radix-select.mts'

const seededReportCreatedAt = new Date(Date.UTC(9999, 11, 31, 23, 59, 59, 999))

let ownerUserId = ''
let moderatorUserId = ''
let memberUserId = ''
let communitySlug = ''
let communityId = ''
let viewPostTitle = ''
let viewPostId = ''
let approvePostTitle = ''
let rejectPostTitle = ''
let emptyQueueCommunitySlug = ''

test.beforeAll(async () => {
  const suffix = randomSuffix()

  const owner = await createTestUser({ username: `mod-queue-owner-${suffix}` })
  if (!owner) throw new Error('Failed to create owner user')
  ownerUserId = owner.id

  const moderator = await createTestUser({ username: `mod-queue-mod-${suffix}` })
  if (!moderator) throw new Error('Failed to create moderator user')
  moderatorUserId = moderator.id

  const member = await createTestUser({ username: `mod-queue-member-${suffix}` })
  if (!member) throw new Error('Failed to create member user')
  memberUserId = member.id

  communitySlug = `mod-queue-test-${suffix}`
  const community = await insertTestCommunity({
    createdById: owner.id,
    slug: communitySlug,
    name: `Mod Queue Test ${suffix}`,
    post_approval_required_at: new Date(),
  })
  communityId = community.id

  await insertTestCommunityMember({ communityId, userId: owner.id, role: 'owner' })
  await insertTestCommunityMember({ communityId, userId: moderator.id, role: 'moderator' })
  await insertTestCommunityMember({ communityId, userId: member.id, role: 'member' })

  emptyQueueCommunitySlug = `mod-queue-empty-${suffix}`
  const emptyCommunity = await insertTestCommunity({
    createdById: owner.id,
    slug: emptyQueueCommunitySlug,
    name: `Mod Queue Empty ${suffix}`,
    post_approval_required_at: new Date(),
  })
  await insertTestCommunityMember({
    communityId: emptyCommunity.id,
    userId: owner.id,
    role: 'owner',
  })
  // View-only post: never mutated so the visibility test is safe under parallel execution
  viewPostTitle = `Pending view post ${suffix}`
  viewPostId = await insertTestPost({
    title: viewPostTitle,
    slug: `mod-queue-view-${suffix}`,
    createdById: member.id,
    markdown: 'Post for visibility check in mod queue.',
    communityId,
  })
  await insertTestPendingCommunityPostReview({
    communityId,
    postId: viewPostId,
    submittedById: member.id,
  })
  await insertTestModerationReport({
    reporterUserId: member.id,
    entityType: 'post',
    entityId: viewPostId,
    reason: 'spam',
  })

  approvePostTitle = `Pending approve post ${suffix}`
  const approvePostId = await insertTestPost({
    title: approvePostTitle,
    slug: `mod-queue-approve-${suffix}`,
    createdById: member.id,
    markdown: 'Post pending approval in mod queue.',
    communityId,
  })
  await insertTestPendingCommunityPostReview({
    communityId,
    postId: approvePostId,
    submittedById: member.id,
  })

  rejectPostTitle = `Pending reject post ${suffix}`
  const rejectPostId = await insertTestPost({
    title: rejectPostTitle,
    slug: `mod-queue-reject-${suffix}`,
    createdById: member.id,
    markdown: 'Post pending rejection in mod queue.',
    communityId,
  })
  await insertTestPendingCommunityPostReview({
    communityId,
    postId: rejectPostId,
    submittedById: member.id,
  })
})

test.describe('Community mod queue', () => {
  test('owner sees pending posts in mod queue', async ({ page }) => {
    await loginAsUser(page, ownerUserId)
    await navigateTo(page, `/communities/${communitySlug}/settings/moderation`)

    await expect(page.getByTestId('community-moderation-heading')).toBeVisible()
    await expect(page.getByTestId('community-report-sort')).toBeVisible()
    await expect(page.getByTestId('moderation-sla-badge')).toBeVisible()
    await expect(page.getByTestId('moderation-report-count-badge')).toBeVisible()
    await openRadixDropdown(page.getByTestId('community-report-sort'))
    await page.getByRole('listbox').getByRole('option', { name: 'Most reported' }).click()
    await page.getByTestId('mod-queue-tab-posts').click()
    await expect(
      page.getByTestId('mod-queue-post-title').filter({ hasText: viewPostTitle }),
    ).toBeVisible()
  })

  test('owner can use moderation queue keyboard shortcuts', async ({ page }) => {
    await loginAsUser(page, ownerUserId)
    await navigateTo(page, `/communities/${communitySlug}/settings/moderation`)

    await page.getByTestId('mod-queue-tab-posts').click()
    const titleLocator = page.getByTestId('mod-queue-post-title').filter({ hasText: viewPostTitle })
    await expect(titleLocator).toBeVisible()
    await waitForBelowFoldHydration(page)

    await page.keyboard.press('x')
    await expect(page.getByTestId('moderation-selected-count')).toBeVisible()

    await page.keyboard.press('?')
    await expect(page.getByTestId('keyboard-shortcuts-title')).toHaveText('Moderation Shortcuts')
  })

  test('owner approves a pending post', async ({ page }) => {
    await loginAsUser(page, ownerUserId)
    await navigateTo(page, `/communities/${communitySlug}/settings/moderation`)

    await page.getByTestId('mod-queue-tab-posts').click()
    const titleLocator = page
      .getByTestId('mod-queue-post-title')
      .filter({ hasText: approvePostTitle })
    await expect(titleLocator).toBeVisible()

    const postCard = page.getByTestId('mod-queue-post-card').filter({ has: titleLocator })
    const approveButton = postCard.getByTestId('mod-queue-approve')
    await expect(approveButton).toBeVisible()
    await approveButton.scrollIntoViewIfNeeded()
    await waitForBelowFoldHydration(page)

    await approveButton.click()

    await expect(titleLocator).not.toBeAttached()
  })

  test('owner rejects a pending post with reason', async ({ page }) => {
    await loginAsUser(page, ownerUserId)
    await navigateTo(page, `/communities/${communitySlug}/settings/moderation`)

    await page.getByTestId('mod-queue-tab-posts').click()
    const titleLocator = page
      .getByTestId('mod-queue-post-title')
      .filter({ hasText: rejectPostTitle })
    await expect(titleLocator).toBeVisible()

    const postCard = page.getByTestId('mod-queue-post-card').filter({ has: titleLocator })
    const rejectButton = postCard.getByTestId('mod-queue-reject')
    await expect(rejectButton).toBeVisible()
    await rejectButton.scrollIntoViewIfNeeded()
    await waitForBelowFoldHydration(page)

    await rejectButton.click()

    const reasonTextarea = postCard.getByTestId('mod-queue-rejection-reason')
    await expect(reasonTextarea).toBeVisible()
    await reasonTextarea.pressSequentially('Does not meet community guidelines.')

    const confirmButton = postCard.getByTestId('mod-queue-reject-confirm')
    await expect(confirmButton).toBeVisible()
    await confirmButton.click()

    await expect(titleLocator).not.toBeAttached()
  })

  test('moderator can access the mod queue', async ({ page }) => {
    await loginAsUser(page, moderatorUserId)
    await navigateTo(page, `/communities/${communitySlug}/settings/moderation`)

    await expect(page.getByTestId('community-moderation-heading')).toBeVisible()
  })

  test('non-moderator member cannot access mod queue', async ({ page }) => {
    await loginAsUser(page, memberUserId)
    await navigateTo(page, `/communities/${communitySlug}/settings/moderation`)

    await expect(page.getByTestId('status-page-title')).toBeVisible()
    await expect(page.getByTestId('community-moderation-heading')).not.toBeAttached()
  })

  test('empty queue shows empty state', async ({ page }) => {
    await loginAsUser(page, ownerUserId)
    await navigateTo(page, `/communities/${emptyQueueCommunitySlug}/settings/moderation`)

    await expect(page.getByTestId('community-moderation-heading')).toBeVisible()
    await expect(page.getByTestId('mod-queue-empty')).toBeVisible()
  })

  test('owner sees pending reports in mod queue', async ({ page }) => {
    await loginAsUser(page, ownerUserId)
    await navigateTo(page, `/communities/${communitySlug}/settings/moderation`)

    await expect(page.getByTestId('community-moderation-heading')).toBeVisible()
    await expect(page.getByTestId('mod-queue-reports')).toBeVisible()
    await expect(page.getByTestId('community-report-sort')).toBeVisible()
  })
})

async function seedCommunityBanEvasionReport(suffix: string) {
  const source = await createTestUser({ username: `cbe-source-${suffix}` })
  if (!source) throw new Error('Failed to create source user')
  const suspect = await createTestUser({ username: `cbe-suspect-${suffix}` })
  if (!suspect) throw new Error('Failed to create suspect user')

  const slug = `cbe-queue-${suffix}`
  const community = await insertTestCommunity({
    createdById: source.id,
    visibility: 'public',
    slug,
  })
  await insertTestCommunityMember({ communityId: community.id, userId: source.id, role: 'owner' })
  await insertTestCommunityMember({ communityId: community.id, userId: suspect.id })

  await setTestBanEvasionFlag({
    communityId: community.id,
    userId: suspect.id,
    sourceUserId: source.id,
    score: 0.85,
  })
  const reportId = await insertTestSystemModerationReport(
    'user',
    suspect.id,
    `Suspected ban evasion ${suffix}`,
    seededReportCreatedAt,
  )

  return { slug, communityId: community.id, sourceId: source.id, suspectId: suspect.id, reportId }
}

test.describe('Community mod queue — ban-evasion badge', () => {
  let banEvasionCommunitySlug = ''
  let banEvasionOwnerId = ''

  test.beforeAll(async () => {
    const suffix = randomSuffix()
    const result = await seedCommunityBanEvasionReport(suffix)
    banEvasionCommunitySlug = result.slug
    banEvasionOwnerId = result.sourceId
  })

  test('owner sees redacted ban-evasion badge in community mod queue', async ({ page }) => {
    await loginAsUser(page, banEvasionOwnerId)
    await navigateTo(page, `/communities/${banEvasionCommunitySlug}/settings/moderation`)

    await expect(page.getByTestId('mod-queue-reports')).toBeVisible()
    await expect(page.getByTestId('community-ban-evasion-badge')).toBeVisible()
    await expect(page.getByTestId('community-ban-evasion-confirm')).not.toBeAttached()
    await expect(page.getByTestId('community-ban-evasion-dismiss')).toBeVisible()
  })

  test('owner can dismiss the ban-evasion flag from community mod queue', async ({ page }) => {
    const { slug, sourceId } = await seedCommunityBanEvasionReport(randomSuffix())
    await loginAsUser(page, sourceId)
    await navigateTo(page, `/communities/${slug}/settings/moderation`)

    await expect(page.getByTestId('community-ban-evasion-dismiss')).toBeVisible()
    await page.getByTestId('community-ban-evasion-dismiss').click()

    await expect(page.getByTestId('community-ban-evasion-badge')).not.toBeAttached()
  })
})
