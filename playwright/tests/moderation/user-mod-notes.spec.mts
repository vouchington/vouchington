import { expect, test, type Page } from '../../helpers/test.mts'
import { createTestUser, insertTestModerationReport } from '../../../backend/test-helpers/index.mts'
import { createSiteModeratorUser, loginAsUser } from '../../helpers/auth.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { randomSuffix } from '../../helpers/random-id.mts'
import { requireTestValue } from '../../helpers/assertions.mts'
import { AUTH_STATE } from '../../helpers/auth-state.mts'
import { TEST_USER_ID } from '../../../integration-tests/web/helpers/constants.mts'

let targetUserId = ''
let targetUsername = ''
let suffix = ''

test.beforeAll(async () => {
  suffix = randomSuffix()

  targetUsername = `modnote-target-${suffix}`
  const target = requireTestValue(
    await createTestUser({ username: targetUsername }),
    'Failed to create target user',
  )
  targetUserId = target.id

  await insertTestModerationReport({
    reporterUserId: TEST_USER_ID,
    entityType: 'user',
    entityId: targetUserId,
    reason: 'spam',
  })
})

async function openSeededUserReportCluster(page: Page) {
  await expect(page.getByTestId('reports-cluster-list')).toBeVisible()

  const reportCluster = page.getByTestId('report-cluster-row').filter({ hasText: targetUsername })
  await expect(reportCluster).toBeVisible()
  await reportCluster.getByRole('button', { name: new RegExp(targetUsername) }).click()

  return reportCluster
}

test.describe('User Mod Notes — Reports Page', () => {
  test.use({ storageState: AUTH_STATE })

  test('admin sees Notes trigger for user-type reports', async ({ page }) => {
    await navigateTo(page, '/reports')

    const reportCluster = await openSeededUserReportCluster(page)

    const trigger = reportCluster.getByTestId('user-mod-notes-trigger').first()
    await expect(trigger).toBeVisible()
  })

  test('admin can open mod notes panel for a user report', async ({ page }) => {
    await navigateTo(page, '/reports')

    const reportCluster = await openSeededUserReportCluster(page)

    const trigger = reportCluster.getByTestId('user-mod-notes-trigger').first()
    await expect(trigger).toBeVisible()

    await trigger.click()

    await expect(page.getByTestId('user-mod-notes-panel')).toBeVisible()
  })

  test('admin can add a mod note and see it in the list', async ({ page }) => {
    await navigateTo(page, '/reports')

    const reportCluster = await openSeededUserReportCluster(page)

    const trigger = reportCluster.getByTestId('user-mod-notes-trigger').first()
    await trigger.click()

    await expect(page.getByTestId('user-mod-notes-panel')).toBeVisible()

    const noteBody = `Test mod note ${suffix}`
    const textarea = page.getByTestId('mod-note-body').first()
    await textarea.pressSequentially(noteBody)

    const submitButton = page.getByTestId('mod-note-submit').first()
    await submitButton.click()

    // Note should appear in the list
    await expect(page.getByTestId('mod-note-item').first()).toContainText(noteBody)
  })

  test('admin can delete a mod note', async ({ page }) => {
    await navigateTo(page, '/reports')

    const reportCluster = await openSeededUserReportCluster(page)

    const trigger = reportCluster.getByTestId('user-mod-notes-trigger').first()
    await trigger.click()

    await expect(page.getByTestId('user-mod-notes-panel')).toBeVisible()

    // Add a note first
    const noteBody = `Delete me ${suffix}`
    const textarea = page.getByTestId('mod-note-body').first()
    await textarea.pressSequentially(noteBody)

    const submitButton = page.getByTestId('mod-note-submit').first()
    await submitButton.click()

    // Wait for the note to appear
    const noteItem = page.getByTestId('mod-note-item').filter({ hasText: noteBody })
    await expect(noteItem).toHaveCount(1)

    // Delete the note
    const deleteButton = noteItem.getByTestId('mod-note-delete')
    await expect(deleteButton).toBeEnabled()
    await deleteButton.scrollIntoViewIfNeeded()
    await deleteButton.click()

    // The note should be gone
    await expect(page.getByTestId('mod-note-item').filter({ hasText: noteBody })).toHaveCount(0)
  })
})

test.describe('User Mod Notes — Non-staff cannot access', () => {
  test('non-staff user does not see Notes column on reports page', async ({ page }) => {
    const regularUser = requireTestValue(
      await createTestUser({ username: `modnote-regular-${suffix}` }),
      'Failed to create regular user',
    )

    await loginAsUser(page, regularUser.id)
    await navigateTo(page, '/reports')

    await expect(page.getByTestId('reports-list')).toBeVisible()

    // Non-staff users see member-report-row, not admin report-row — no mod notes trigger
    await expect(page.getByTestId('user-mod-notes-trigger')).toHaveCount(0)
  })
})

test.describe('User Mod Notes — Site Moderator', () => {
  let smModeratorId = ''

  test.beforeAll(async () => {
    const moderator = await createSiteModeratorUser()
    smModeratorId = moderator.id
  })

  test('site moderator can add a mod note from the reports page', async ({ page }) => {
    await loginAsUser(page, smModeratorId)
    await navigateTo(page, '/reports')

    const reportCluster = await openSeededUserReportCluster(page)

    const trigger = reportCluster.getByTestId('user-mod-notes-trigger').first()
    await expect(trigger).toBeVisible()
    await trigger.click()

    await expect(page.getByTestId('user-mod-notes-panel')).toBeVisible()

    const noteBody = `SM mod note ${suffix}`
    const textarea = page.getByTestId('mod-note-body').first()
    await textarea.pressSequentially(noteBody)

    const submitButton = page.getByTestId('mod-note-submit').first()
    await submitButton.click()

    // filter by body text — avoids grabbing an admin note inserted by a parallel test
    await expect(page.getByTestId('mod-note-item').filter({ hasText: noteBody })).toBeVisible()
  })
})
