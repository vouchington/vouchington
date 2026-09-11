import { test, expect } from '../../helpers/test.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { randomSuffix } from '../../helpers/random-id.mts'
import { AUTH_STATE } from '../../helpers/auth-state.mts'
import { loginAsUser } from '../../helpers/auth.mts'
import { requireTestValue } from '../../helpers/assertions.mts'
import {
  createTestUser,
  insertTestCommunity,
  insertTestCommunityMember,
  insertTestModerationReport,
  insertTestPost,
  insertTestUserWarning,
} from '../../../backend/test-helpers/index.mts'

let targetUserId = ''
let warningPublicMessage = ''
let warningReason = ''
let targetUsername = ''
let modQueueOwnerId = ''
let modQueueCommunitySlug = ''
let modQueuePostTitle = ''

test.beforeAll(async () => {
  const suffix = randomSuffix()
  const usernameSuffix = suffix.replaceAll(/\d/g, digit => 'abcdefghij'[Number(digit)])

  const target = requireTestValue(
    await createTestUser({ username: `warn-target-e2e-${usernameSuffix}` }),
    'Failed to create target user',
  )
  targetUserId = target.id
  targetUsername = `warn-target-e2e-${usernameSuffix}`

  warningPublicMessage = `E2E warning public message ${suffix}`
  warningReason = `Seeded warning reason ${suffix}`

  // Pre-seed a warning so the list view has something to render
  const issuer = requireTestValue(await createTestUser(), 'Failed to create issuer user')
  await insertTestUserWarning({
    userId: target.id,
    issuedById: issuer.id,
    reason: warningReason,
    publicMessage: warningPublicMessage,
  })

  const reportAuthor = requireTestValue(await createTestUser(), 'Failed to create report author')
  await insertTestModerationReport({
    reporterUserId: reportAuthor.id,
    entityType: 'user',
    entityId: targetUserId,
    reason: 'spam',
  })

  const modQueueOwner = requireTestValue(await createTestUser(), 'Failed to create mod queue owner')
  modQueueOwnerId = modQueueOwner.id
  modQueueCommunitySlug = `warn-mod-queue-${suffix}`
  const community = await insertTestCommunity({
    createdById: modQueueOwner.id,
    slug: modQueueCommunitySlug,
    name: `Warn mod queue ${suffix}`,
    post_approval_required_at: new Date(),
  })
  await insertTestCommunityMember({
    communityId: community.id,
    userId: modQueueOwner.id,
    role: 'owner',
  })
  modQueuePostTitle = `Warn mod queue post ${suffix}`
  const postId = await insertTestPost({
    title: modQueuePostTitle,
    slug: `warn-mod-queue-post-${suffix}`,
    createdById: targetUserId,
    markdown: 'A pending report for the warning button test.',
    communityId: community.id,
  })
  await insertTestModerationReport({
    reporterUserId: reportAuthor.id,
    entityType: 'post',
    entityId: postId,
    reason: 'spam',
  })
})

test.describe('User Warnings — /my/warnings page', () => {
  test('shows warnings list with date and public message', async ({ page }) => {
    await loginAsUser(page, targetUserId)
    await navigateTo(page, '/my/warnings')

    await expect(page.getByTestId('my-warnings-page')).toBeVisible()
    await expect(page.getByTestId('my-warnings-list')).toBeVisible()
    const items = page.getByTestId('my-warning-item')
    await expect(items).not.toHaveCount(0)

    // Verify date and public message selectors
    await expect(page.getByTestId('my-warning-date').first()).toBeVisible()
    await expect(page.getByTestId('my-warning-public-message').first()).toBeVisible()
  })

  test('shows "no message" indicator when warning has no public message', async ({ page }) => {
    const suffix = randomSuffix()
    const noMsgUser = requireTestValue(await createTestUser(), 'Failed to create user')
    const issuer = requireTestValue(await createTestUser(), 'Failed to create issuer')
    await insertTestUserWarning({
      userId: noMsgUser.id,
      issuedById: issuer.id,
      reason: `No-message warning ${suffix}`,
      publicMessage: null,
    })

    await loginAsUser(page, noMsgUser.id)
    await navigateTo(page, '/my/warnings')

    await expect(page.getByTestId('my-warnings-list')).toBeVisible()
    await expect(page.getByTestId('my-warning-no-message').first()).toBeVisible()
  })

  test('shows empty state for a user with no warnings', async ({ page }) => {
    const cleanUser = requireTestValue(await createTestUser(), 'Failed to create clean user')

    await loginAsUser(page, cleanUser.id)
    await navigateTo(page, '/my/warnings')

    await expect(page.getByTestId('my-warnings-empty')).toBeVisible()
  })
})

test.describe('User Warnings — Admin Panel', () => {
  test.use({ storageState: AUTH_STATE })

  test('admin panel shows warnings section and items', async ({ page }) => {
    await navigateTo(page, `/user/${targetUserId}/admin`)

    // Loading state may flash briefly; wait for list to settle
    await expect(page.getByTestId('user-admin-warnings-loading')).toBeHidden()
    await expect(page.getByTestId('user-admin-warnings-title')).toBeVisible()
    await expect(page.getByTestId('user-admin-warnings-list')).toBeVisible()

    const items = page.getByTestId('user-admin-warning-item')
    await expect(items).not.toHaveCount(0)

    // Verify individual item sub-selectors
    await expect(page.getByTestId('user-admin-warning-reason').first()).toBeVisible()
    await expect(page.getByTestId('user-admin-warning-date').first()).toBeVisible()
    await expect(page.getByTestId('user-admin-warning-public-message').first()).toBeVisible()
  })

  test('admin panel shows empty state for user with no warnings', async ({ page }) => {
    const suffix = randomSuffix()
    const usernameSuffix = suffix.replaceAll(/\d/g, digit => 'abcdefghij'[Number(digit)])
    const freshUser = requireTestValue(
      await createTestUser({ username: `warn-empty-e2e-${usernameSuffix}` }),
      'Failed to create fresh user',
    )

    await navigateTo(page, `/user/${freshUser.id}/admin`)

    await expect(page.getByTestId('user-admin-warnings-loading')).toBeHidden()
    await expect(page.getByTestId('user-admin-warnings-empty')).toBeVisible()
  })

  test('admin can open the issue warning dialog and see public message field', async ({ page }) => {
    await navigateTo(page, `/user/${targetUserId}/admin`)

    const trigger = page.getByTestId('issue-warning-trigger')
    await expect(trigger).toBeVisible()
    await trigger.click()

    await expect(page.getByTestId('issue-warning-dialog')).toBeVisible()
    await expect(page.getByTestId('issue-warning-public-message')).toBeVisible()
  })

  test('admin can issue a warning via the dialog', async ({ page }) => {
    const suffix = randomSuffix()
    const reason = `E2E admin warning ${suffix}`

    await navigateTo(page, `/user/${targetUserId}/admin`)

    // Open dialog
    const trigger = page.getByTestId('issue-warning-trigger')
    await trigger.click()
    await expect(page.getByTestId('issue-warning-dialog')).toBeVisible()

    // Fill in reason
    const reasonField = page.getByTestId('issue-warning-reason')
    await reasonField.pressSequentially(reason)

    // Submit
    const submitButton = page.getByTestId('issue-warning-submit')
    await expect(submitButton).toBeEnabled()
    await submitButton.click()

    // Dialog should close after success
    await expect(page.getByTestId('issue-warning-dialog')).toBeHidden()

    // Warning should appear in the list
    await expect(page.getByTestId('user-admin-warnings-list')).toBeVisible()
    await expect(page.getByText(reason)).toBeVisible()
  })
})

test.describe('User Warnings — Report Warn Button', () => {
  test.use({ storageState: AUTH_STATE })

  test('report row shows warn button for user reports', async ({ page }) => {
    await navigateTo(page, '/reports?cluster=none&sort=created_at_desc&limit=100')

    const userReport = page.getByTestId('report-row').filter({ hasText: targetUsername })
    await expect(userReport).toBeVisible()
    await expect(userReport.getByTestId('report-row-warn-button')).toBeVisible()
  })
})

test.describe('User Warnings — Mod Queue Warn Button', () => {
  test.use({ storageState: AUTH_STATE })

  test('mod queue report card shows warn button', async ({ page }) => {
    await loginAsUser(page, modQueueOwnerId)
    await navigateTo(page, `/communities/${modQueueCommunitySlug}/settings/moderation`)

    const reportCard = page
      .getByTestId('mod-queue-report-card')
      .filter({ hasText: modQueuePostTitle })
    await expect(reportCard).toBeVisible()
    await expect(reportCard.getByTestId('mod-queue-warn-button')).toBeVisible()
  })
})
