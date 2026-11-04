import { test, expect, protectPlaywrightHookTimeouts } from '../../helpers/test.mts'
import { DESKTOP_VIEWPORT, navigateTo, randomSuffix } from 'vouchington-tooling/playwright'
import { ADMIN_AUTH_STATE } from '../../helpers/auth-state.mts'
import { loginAsUser } from '../../helpers/auth.mts'
import {
  createTestUser,
  insertTestUserWarning,
  insertTestModerationAppeal,
} from '../../../backend/test-helpers/index.mts'

let appellantId = ''
// Captured so the smoke test can scope to this exact row and not accidentally
// pick up the lifecycle appeal after it has been mutated (fullyParallel: true).
let smokeAppealId = ''

test.beforeAll(async () => {
  protectPlaywrightHookTimeouts(test.info())
  const suffix = randomSuffix()
  const usernameSuffix = suffix.replaceAll(/\d/g, digit => 'abcdefghij'[Number(digit)])

  // Appellant: a regular user (non-staff) who files the appeal
  const appellant = await createTestUser({ username: `appeal-e2e-${usernameSuffix}` })
  if (!appellant) throw new Error('Failed to create appellant user')
  appellantId = appellant.id

  // Issuer: a separate user who issued the warning (direct DB insert, no role check)
  const issuer = await createTestUser()
  if (!issuer) throw new Error('Failed to create issuer user')

  const warning = await insertTestUserWarning({
    userId: appellant.id,
    issuedById: issuer.id,
    reason: `E2E warning reason ${suffix}`,
  })

  // Seed a pending appeal with a public_response so the Approve button is enabled
  const smokeAppeal = await insertTestModerationAppeal({
    appellantId: appellant.id,
    userWarningId: warning.id,
    communityId: warning.community_id,
    appealReason: `E2E appeal reason ${suffix}`,
    publicResponse: `E2E appeal response ${suffix}`,
  })
  smokeAppealId = smokeAppeal.id
})

test.describe('Appeals — staff view', () => {
  test.use({ storageState: ADMIN_AUTH_STATE })

  // Separate appeal seeded for the lifecycle test so it isn't mutated by the visibility test
  // (fullyParallel: true means both tests can run concurrently)
  let lifecycleAppealId = ''

  test.beforeAll(async () => {
    protectPlaywrightHookTimeouts(test.info())
    const suffix = randomSuffix()
    const usernameSuffix = suffix.replaceAll(/\d/g, digit => 'abcdefghij'[Number(digit)])

    const lifecycleAppellant = await createTestUser({
      username: `appeal-lifecycle-${usernameSuffix}`,
    })
    if (!lifecycleAppellant) throw new Error('Failed to create lifecycle appellant')
    const lifecycleIssuer = await createTestUser()
    if (!lifecycleIssuer) throw new Error('Failed to create lifecycle issuer')

    const lifecycleWarning = await insertTestUserWarning({
      userId: lifecycleAppellant.id,
      issuedById: lifecycleIssuer.id,
      reason: `Lifecycle warning ${suffix}`,
    })

    const appeal = await insertTestModerationAppeal({
      appellantId: lifecycleAppellant.id,
      userWarningId: lifecycleWarning.id,
      communityId: lifecycleWarning.community_id,
      appealReason: `Lifecycle appeal reason ${suffix}`,
      publicResponse: `Lifecycle public response ${suffix}`,
    })
    lifecycleAppealId = appeal.id
  })

  test('staff sees appeals heading, list, appeal rows, and action buttons', async ({ page }) => {
    await page.setViewportSize(DESKTOP_VIEWPORT)
    await navigateTo(page, '/appeals')

    await expect(page.getByTestId('appeals-heading')).toBeVisible()
    await expect(page.getByTestId('appeals-list')).toBeVisible()
    // Rows may exist in resolved state — just assert there is at least one.
    await expect(page.getByTestId('appeal-row').first()).toBeVisible()

    // Scope action-button assertions to the smoke appeal row — avoids grabbing the
    // lifecycle appeal which may have been mutated (approve→send→accept) by the
    // concurrent lifecycle test and would no longer render action buttons.
    const smokeRow = page.locator(`[data-appeal-id="${smokeAppealId}"]`)
    await expect(smokeRow).toBeVisible()
    await expect(smokeRow.getByTestId('appeal-context')).toBeVisible()

    // Drafts and actions load from the detail route when the row is opened
    await smokeRow.getByTestId('appeal-open').click()
    const smokeDialog = page.getByTestId('appeal-detail-dialog')
    await expect(smokeDialog.getByTestId('appeal-detail')).toBeVisible()
    await expect(smokeDialog.getByTestId('appeal-public-response')).toBeVisible()
    await expect(smokeDialog.getByTestId('appeal-row-re-run-ai')).toBeVisible()
    await expect(smokeDialog.getByTestId('appeal-approve')).toBeVisible()
    await expect(smokeDialog.getByTestId('appeal-send')).toBeVisible()
    await expect(smokeDialog.getByTestId('appeal-accept')).toBeVisible()
    await expect(smokeDialog.getByTestId('appeal-reduce')).toBeVisible()
    await expect(smokeDialog.getByTestId('appeal-deny')).toBeVisible()
  })

  test('staff can run the full approve→send→accept lifecycle', async ({ page }) => {
    await page.setViewportSize(DESKTOP_VIEWPORT)
    await navigateTo(page, '/appeals')

    await expect(page.getByTestId('appeals-list')).toBeVisible()

    const appealRow = page.locator(`[data-appeal-id="${lifecycleAppealId}"]`)
    await expect(appealRow).toBeVisible()
    await appealRow.getByTestId('appeal-open').click()
    const dialog = page.getByTestId('appeal-detail-dialog')

    // Step 1: Approve (enabled because publicResponse is set)
    const approveBtn = dialog.getByTestId('appeal-approve')
    await expect(approveBtn).toBeEnabled()
    await approveBtn.click()

    // After approve, the Send button becomes enabled (approved_at is set)
    const sendBtn = dialog.getByTestId('appeal-send')
    await expect(sendBtn).toBeEnabled()

    // Step 2: Send
    await sendBtn.click()

    // After send, the public response textarea is disabled (sent_at is set)
    await expect(dialog.getByTestId('appeal-public-response')).toBeDisabled()

    // Step 3: Resolve (accept)
    const acceptBtn = dialog.getByTestId('appeal-accept')
    await expect(acceptBtn).toBeVisible()
    await acceptBtn.click()

    // After resolving, the row is no longer pending — approve button disappears
    await expect(dialog.getByTestId('appeal-approve')).not.toBeAttached()
  })
})

test.describe('Appeals — member view', () => {
  test('member sees their own appeal row at /my/appeals', async ({ page }) => {
    // loginAsUser navigates to '/' to set cookies; callers issue their own navigateTo
    await loginAsUser(page, appellantId)
    await navigateTo(page, '/my/appeals')

    await expect(page.getByTestId('member-appeal-row').first()).toBeVisible()
  })
})
