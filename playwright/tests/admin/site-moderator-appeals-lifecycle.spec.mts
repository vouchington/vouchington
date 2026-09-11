import { test, expect } from '../../helpers/test.mts'
import { loginAsUser, createSiteModeratorUser } from '../../helpers/auth.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { randomSuffix } from '../../helpers/random-id.mts'
import { DESKTOP_VIEWPORT } from '../../helpers/viewport-constants.mts'
import {
  createTestUser,
  insertTestUserWarning,
  insertTestModerationAppeal,
} from '../../../backend/test-helpers/index.mts'

let smUserId = ''
let lifecycleAppealId = ''

test.beforeAll(async () => {
  const suffix = randomSuffix()
  // Digit-to-letter substitution mirrors appeals.spec.mts to keep usernames valid.
  const usernameSuffix = suffix.replaceAll(/\d/g, digit => 'abcdefghij'[Number(digit)])

  const sm = await createSiteModeratorUser()
  smUserId = sm.id

  const appellant = await createTestUser({ username: `sm-appeal-user-${usernameSuffix}` })
  if (!appellant) throw new Error('Failed to create appellant')

  const issuer = await createTestUser()
  if (!issuer) throw new Error('Failed to create issuer')

  const warning = await insertTestUserWarning({
    userId: appellant.id,
    issuedById: issuer.id,
    reason: `SM lifecycle warning ${suffix}`,
  })

  // Seed with a publicResponse so the Approve button is immediately enabled.
  const appeal = await insertTestModerationAppeal({
    appellantId: appellant.id,
    userWarningId: warning.id,
    communityId: warning.community_id,
    appealReason: `SM lifecycle appeal reason ${suffix}`,
    publicResponse: `SM lifecycle public response ${suffix}`,
  })
  lifecycleAppealId = appeal.id
})

test.describe('Appeals — site moderator lifecycle', () => {
  test('site moderator can run the full approve→send→accept lifecycle', async ({ page }) => {
    await page.setViewportSize(DESKTOP_VIEWPORT)
    await loginAsUser(page, smUserId)
    await navigateTo(page, '/appeals')

    await expect(page.getByTestId('appeals-list')).toBeVisible()

    // Scope to the specific appeal row so the test is stable regardless of
    // how many other pending appeals exist on a dirty database.
    const appealRow = page.locator(`[data-appeal-id="${lifecycleAppealId}"]`)
    await expect(appealRow).toBeVisible()

    // Step 1: Approve (enabled because publicResponse is set)
    const approveBtn = appealRow.getByTestId('appeal-approve')
    await expect(approveBtn).toBeEnabled()
    await approveBtn.click()

    // After approve, the Send button becomes enabled (approved_at is set).
    const sendBtn = appealRow.getByTestId('appeal-send')
    await expect(sendBtn).toBeEnabled()

    // Step 2: Send
    await sendBtn.click()

    // After send, the public response textarea is disabled (sent_at is set).
    await expect(appealRow.getByTestId('appeal-public-response')).toBeDisabled()

    // Step 3: Resolve (accept)
    const acceptBtn = appealRow.getByTestId('appeal-accept')
    await expect(acceptBtn).toBeVisible()
    await acceptBtn.click()

    // After resolving, the row is no longer pending — approve button disappears.
    await expect(appealRow.getByTestId('appeal-approve')).not.toBeAttached()
  })
})
