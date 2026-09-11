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
  insertTestModerationQueueClaim,
} from '../../../backend/test-helpers/index.mts'

let ownerUserId = ''
let secondModId = ''
let slugA = ''
let idA = ''
let slugB = ''
let idB = ''
let reportIdForClaim = ''
let reportIdForEscalate = ''
let reportIdOtherClaimed = ''
let postIdForClaim = ''
let postIdForEscalate = ''
let postIdOtherClaimed = ''

test.beforeAll(async () => {
  const s = randomSuffix()
  const owner = await createTestUser({ username: `mqcl-owner-${s}` })
  if (!owner) throw new Error('no owner')
  ownerUserId = owner.id
  const secondMod = await createTestUser({ username: `mqcl-mod-${s}` })
  if (!secondMod) throw new Error('no second mod')
  secondModId = secondMod.id
  const member = await createTestUser({ username: `mqcl-member-${s}` })
  if (!member) throw new Error('no member')

  // Community A: reports-only queue (no post_approval_required → Posts tab empty)
  slugA = `mqcl-a-${s}`
  const comA = await insertTestCommunity({
    createdById: owner.id,
    slug: slugA,
    name: `MQCL A ${s}`,
  })
  idA = comA.id
  await insertTestCommunityMember({ communityId: idA, userId: owner.id, role: 'owner' })
  await insertTestCommunityMember({ communityId: idA, userId: secondMod.id, role: 'moderator' })

  const targetA1 = await insertTestPost({
    title: `MQCL target A1 ${s}`,
    slug: `mqcl-target-a1-${s}`,
    createdById: member.id,
    markdown: 'test',
    communityId: idA,
  })
  const targetA2 = await insertTestPost({
    title: `MQCL target A2 ${s}`,
    slug: `mqcl-target-a2-${s}`,
    createdById: member.id,
    markdown: 'test',
    communityId: idA,
  })
  const targetA3 = await insertTestPost({
    title: `MQCL target A3 ${s}`,
    slug: `mqcl-target-a3-${s}`,
    createdById: member.id,
    markdown: 'test',
    communityId: idA,
  })
  reportIdForClaim = await insertTestModerationReport({
    reporterUserId: owner.id,
    entityType: 'post',
    entityId: targetA1,
  })
  reportIdForEscalate = await insertTestModerationReport({
    reporterUserId: owner.id,
    entityType: 'post',
    entityId: targetA2,
  })
  reportIdOtherClaimed = await insertTestModerationReport({
    reporterUserId: owner.id,
    entityType: 'post',
    entityId: targetA3,
  })
  await insertTestModerationQueueClaim({
    communityId: idA,
    reportId: reportIdOtherClaimed,
    claimedById: secondModId,
  })

  // Community B: posts-only queue (post_approval_required + no reports → Reports tab empty)
  slugB = `mqcl-b-${s}`
  const comB = await insertTestCommunity({
    createdById: owner.id,
    slug: slugB,
    name: `MQCL B ${s}`,
    post_approval_required_at: new Date(),
  })
  idB = comB.id
  await insertTestCommunityMember({ communityId: idB, userId: owner.id, role: 'owner' })
  await insertTestCommunityMember({ communityId: idB, userId: secondMod.id, role: 'moderator' })
  await insertTestCommunityMember({ communityId: idB, userId: member.id })

  postIdForClaim = await insertTestPost({
    title: `MQCL claim post ${s}`,
    slug: `mqcl-cp-${s}`,
    createdById: member.id,
    markdown: 'test',
    communityId: idB,
  })
  await insertTestPendingCommunityPostReview({
    communityId: idB,
    postId: postIdForClaim,
    submittedById: member.id,
  })
  postIdForEscalate = await insertTestPost({
    title: `MQCL esc post ${s}`,
    slug: `mqcl-ep-${s}`,
    createdById: member.id,
    markdown: 'test',
    communityId: idB,
  })
  await insertTestPendingCommunityPostReview({
    communityId: idB,
    postId: postIdForEscalate,
    submittedById: member.id,
  })
  postIdOtherClaimed = await insertTestPost({
    title: `MQCL other post ${s}`,
    slug: `mqcl-op-${s}`,
    createdById: member.id,
    markdown: 'test',
    communityId: idB,
  })
  await insertTestPendingCommunityPostReview({
    communityId: idB,
    postId: postIdOtherClaimed,
    submittedById: member.id,
  })
  await insertTestModerationQueueClaim({
    communityId: idB,
    postId: postIdOtherClaimed,
    claimedById: secondModId,
  })
})

test.describe('Mod queue — tabs, empty states, claims, escalation', () => {
  test('shows tabs, escalated-empty, and posts-empty', async ({ page }) => {
    await loginAsUser(page, ownerUserId)
    await navigateTo(page, `/communities/${slugA}/settings/moderation`)
    await expect(page.getByTestId('mod-queue-tabs')).toBeVisible()
    await expect(page.getByTestId('mod-queue-tab-reports')).toBeVisible()
    await expect(page.getByTestId('mod-queue-tab-escalated')).toBeVisible()
    await page.getByTestId('mod-queue-tab-posts').click()
    await expect(page.getByTestId('mod-queue-posts-empty')).toBeVisible()
    await page.getByTestId('mod-queue-tab-escalated').click()
    await expect(page.getByTestId('mod-queue-escalated-empty')).toBeVisible()
  })

  test('shows reports-empty', async ({ page }) => {
    await loginAsUser(page, ownerUserId)
    await navigateTo(page, `/communities/${slugB}/settings/moderation`)
    await page.getByTestId('mod-queue-tab-reports').click()
    await expect(page.getByTestId('mod-queue-reports-empty')).toBeVisible()
  })

  test('claim and release a report', async ({ page }) => {
    await loginAsUser(page, ownerUserId)
    await navigateTo(page, `/communities/${slugA}/settings/moderation`)
    await waitForBelowFoldHydration(page)
    const reportCard = page.locator(`[data-report-id="${reportIdForClaim}"]`)
    const claimBtn = reportCard.getByTestId('claim-report-button')
    await expect(claimBtn).toBeVisible()
    await claimBtn.click()
    const myBadge = reportCard.getByTestId('report-claimed-by-me-badge')
    await expect(myBadge).toBeVisible()
    await expect(reportCard.getByTestId('discuss-report-button')).toBeVisible()
    const releaseBtn = reportCard.getByTestId('release-report-button')
    await expect(releaseBtn).toBeVisible()
    await releaseBtn.click()
    await expect(myBadge).not.toBeAttached()
  })

  test('escalate and de-escalate a report', async ({ page }) => {
    await loginAsUser(page, ownerUserId)
    await navigateTo(page, `/communities/${slugA}/settings/moderation`)
    await waitForBelowFoldHydration(page)
    const reportCard = page.locator(`[data-report-id="${reportIdForEscalate}"]`)
    const escalateBtn = reportCard.getByTestId('escalate-report-button')
    await expect(escalateBtn).toBeVisible()
    await escalateBtn.click()
    // After refresh, escalated report moves to the escalated tab
    await expect(escalateBtn).not.toBeAttached()
    await page.getByTestId('mod-queue-tab-escalated').click()
    await expect(page.getByTestId('mod-queue-escalated')).toBeVisible()
    await expect(reportCard.getByTestId('report-escalated-badge')).toBeVisible()
    await expect(reportCard.getByTestId('de-escalate-report-button')).toBeVisible()
    await reportCard.getByTestId('de-escalate-report-button').click()
  })

  test('shows claimed-by-other badge on report', async ({ page }) => {
    await loginAsUser(page, ownerUserId)
    await navigateTo(page, `/communities/${slugA}/settings/moderation`)
    const reportCard = page.locator(`[data-report-id="${reportIdOtherClaimed}"]`)
    await expect(reportCard.getByTestId('report-claimed-by-other-badge')).toBeVisible()
  })

  test('claim and release a post', async ({ page }) => {
    await loginAsUser(page, ownerUserId)
    await navigateTo(page, `/communities/${slugB}/settings/moderation`)
    await page.getByTestId('mod-queue-tab-posts').click()
    await waitForBelowFoldHydration(page)
    const postCard = page.locator(`[data-post-id="${postIdForClaim}"]`)
    const claimBtn = postCard.getByTestId('claim-post-button')
    await expect(claimBtn).toBeVisible()
    await claimBtn.click()
    const myBadge = postCard.getByTestId('post-claimed-by-me-badge')
    await expect(myBadge).toBeVisible()
    await expect(postCard.getByTestId('discuss-post-button')).toBeVisible()
    const releaseBtn = postCard.getByTestId('release-post-button')
    await expect(releaseBtn).toBeVisible()
    await releaseBtn.click()
    await expect(myBadge).not.toBeAttached()
  })

  test('escalate and de-escalate a post', async ({ page }) => {
    await loginAsUser(page, ownerUserId)
    await navigateTo(page, `/communities/${slugB}/settings/moderation`)
    await page.getByTestId('mod-queue-tab-posts').click()
    await waitForBelowFoldHydration(page)
    const postCard = page.locator(`[data-post-id="${postIdForEscalate}"]`)
    const escalateBtn = postCard.getByTestId('escalate-post-button')
    await expect(escalateBtn).toBeVisible()
    await escalateBtn.click()
    // After refresh, escalated post moves to the escalated tab
    await expect(escalateBtn).not.toBeAttached()
    await page.getByTestId('mod-queue-tab-escalated').click()
    await expect(page.getByTestId('mod-queue-escalated')).toBeVisible()
    await expect(postCard.getByTestId('post-escalated-badge')).toBeVisible()
    await expect(postCard.getByTestId('de-escalate-post-button')).toBeVisible()
    await postCard.getByTestId('de-escalate-post-button').click()
  })

  test('shows claimed-by-other badge on post', async ({ page }) => {
    await loginAsUser(page, ownerUserId)
    await navigateTo(page, `/communities/${slugB}/settings/moderation`)
    await page.getByTestId('mod-queue-tab-posts').click()
    const postCard = page.locator(`[data-post-id="${postIdOtherClaimed}"]`)
    await expect(postCard.getByTestId('post-claimed-by-other-badge')).toBeVisible()
  })
})
